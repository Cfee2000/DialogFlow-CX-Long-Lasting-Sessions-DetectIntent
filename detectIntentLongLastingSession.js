// Grab function paths
const syncpath = Runtime.getFunctions().sync.path;
// Next, simply use the standard require() to bring the library into scope
const sync = require(syncpath);

// Imports the Google Cloud API library
const { SessionsClient } = require('@google-cloud/dialogflow-cx');

exports.handler = async function (context, event, callback) {
  let mobileNoPlus = event.Phone.substring(1);
  let languageCode = context.DIALOGFLOW_CX_LANGUAGE_CODE;
  let query = event.utterance;

  // Google requires an environment variable called GOOGLE_APPLICATION_CREDENTIALS that points to a file path with the service account key file (json) to authenticate into their API. To solve for this, we save the key file as a private asset, then use a helper function to find and return the path of the private asset. Lastly we set the environment variable dynamically at runtime so that it's in place when the sessions client is initialized
  process.env.GOOGLE_APPLICATION_CREDENTIALS =
    Runtime.getAssets()['/service-account-key.json'].path;

  // Initialize the SessionsClient- https://googleapis.dev/nodejs/dialogflow-cx/latest/v3.SessionsClient.html
  let client = new SessionsClient({
    apiEndpoint: `${context.DIALOGFLOW_CX_LOCATION}-dialogflow.googleapis.com`,
  });

  //Setup a request object to dynamically populate for sending DetectIntentRequest to Dialogflow CX
  let request = {};
  // For DetectIntent API (public endpoint), Dialogflow (ES and CX) keeps conversation state organized by session ids. The client is responsible for both generating and maintaining the session. We will use (and reuse) the session in Twilio Studio for subsequent turns in a conversation
  if (!event.dialogflow_session_id) {
    //If there's not an existing Session ID for a turn, then create a new one. A new Session ID doesn't have any impact on long lasting sessions
    event.dialogflow_session_id = Math.random().toString(36).substring(7);

    //We need to fetch the last Twilio Sync MapItem that was inserted (see the updateSync() function call). This will help us determine whether we have to revive a Long Lasting Session.
    let syncResult = await sync.fetchLastMapItem(
      context.SYNC_SID,
      mobileNoPlus
    );
    if (syncResult != 'Map does not exist') {
      //If there exists a Twilio SyncMap for this user<->bot interaction, then given we had no SessionId when this conversation turn started, we know there's a Long Lasting Session that needs to be revived. Thus, we setup the DetectIntentRequest to revivie it by using the parameters and currentPage that were stored in the SyncMap Item that we retrieved
      request = {
        session: client.projectLocationAgentSessionPath(
          context.DIALOGFLOW_CX_PROJECT_ID,
          context.DIALOGFLOW_CX_LOCATION,
          context.DIALOGFLOW_CX_AGENT_ID,
          event.dialogflow_session_id
        ),
        queryInput: {
          text: {
            text: query,
          },
          languageCode,
        },
        queryParams: {
          parameters: syncResult[0].data.parameters,
          currentPage: syncResult[0].data.currentPage.name,
          analyzeQueryTextSentiment: true,
        },
      };
    }
  }

  if (Object.keys(request).length === 0) {
    //In the case where we're not reviving a Long Lasting Session, we'll setup the DetectIntentRequest as we typically would
    request = {
      session: client.projectLocationAgentSessionPath(
        context.DIALOGFLOW_CX_PROJECT_ID,
        context.DIALOGFLOW_CX_LOCATION,
        context.DIALOGFLOW_CX_AGENT_ID,
        event.dialogflow_session_id
      ),
      queryInput: {
        text: {
          text: query,
        },
        languageCode,
      },
      queryParams: {
        analyzeQueryTextSentiment: true,
      },
    };
  }

  try {
    let [response] = await client.detectIntent(request);

    //We need to pass the SessionId back to the Twilio Studio Flow so that we maintain the conversational state between user and bot while the session is still active
    response.queryResult.session_id = event.dialogflow_session_id;

    if (response.queryResult.currentPage.displayName != 'End Session') {
      //As long as this isn't the End Session page, we will keep adding the state of DF CX to Sync so it can be retrieved for long lasting sessions

      //(Optional) Create a custom array to hold each of the individual VirtualAgent responses that make up a turn
      let responseMessages = [];
      for (
        let index = 0;
        index < response.queryResult.responseMessages.length;
        index++
      ) {
        if (response.queryResult.responseMessages[index].text) {
          responseMessages.push(
            response.queryResult.responseMessages[index].text.text[0]
          );
        }
      }
      //Setup a Twilio Sync payload that will be used as the storage schema. For Long Lasting sessions, the parameters, currentPage, and sessionID are required because we need these to revive a session. The other parts of this payload are purely optional and can be tailored based on your requirements
      const payloadSync = {
        virtualAgentReply: responseMessages,
        customerIntent: response.queryResult.text,
        sentimentAnalysisScore:
          response.queryResult.sentimentAnalysisResult.score,
        sentimentAnalysisMagnitude:
          response.queryResult.sentimentAnalysisResult.magniture,
        confidence: response.queryResult.match.confidence,
        parameters: response.queryResult.parameters,
        currentPage: response.queryResult.currentPage,
        sessionID: response.queryResult.session_id,
      };
      //This is our invocation of Twilio Sync. We use a Timestamp as the key so we can leverage lexicographic ordering exposed by the Twilio Sync Map Item API endpoint, which allows us to later retrieve the last update when reviving a long lasting session. The user's mobile number is used as the uniqueName of the Map, which almost acts as a psuedo-key for us to uniquely access the user's active session history with Dialogflow CX
      await updateSync(
        new Date().toISOString(),
        payloadSync,
        mobileNoPlus,
        context.SYNC_SERVICE_NAME
      );
    } else {
      //This implies it's the End Session from Dialogflow CX, so we assume there was an appropriate conclusion reached between user and bot. We must now delete the Sync Map as any future replies from the user will be treated by Dialogflow CX as a new session
      await sync.deleteMap(context.SYNC_SID, mobileNoPlus);
    }
    //Send the queryResult data back to Twilio Studio to continue the user<->bot interaction
    callback(null, response.queryResult);
  } catch (error) {
    console.error(error);
    callback(error);
  }
};


/**
 * Update (or create) a SyncMap and then Insert a SyncMap Item
 * based on the parameters supplied
 * @param {string} key The SyncMap key
 * @param {string} payload The JSON payload that will be used to create the SyncMap Item
 * @param {string} mapUniqueName The uniqueName of the SyncMap
 * @param {string} syncServiceName The name of the Twilio Sync Service
 * @returns {Object} SyncMapItem Object
 */
async function updateSync(key, payload, mapUniqueName, syncServiceName) {
  // Write tokens to SyncMap
  try {
    let syncservice = await sync.fetchSyncService(syncServiceName);
    await sync.fetchSyncMap(syncservice.sid, mapUniqueName);
    let syncmapitem = await sync.createOrupdateMapItem(
      syncservice.sid,
      mapUniqueName,
      key,
      payload
    );
    return syncmapitem;
  } catch (err) {
    console.log(err);
    return Promise.reject(err);
  }
}
