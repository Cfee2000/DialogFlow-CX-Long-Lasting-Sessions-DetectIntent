
require('dotenv').config(); //A Node.js Local Environment Variables Library
const fs = require('fs'); //A Node.js FileSystem Library
const parse = require('csv-parse/lib/sync'); //A Node.js CSV Parser Library
const accountSid = process.env.TWILIO_ACCOUNT_SID; //The Account ID for your Twilio Account
const authToken = process.env.TWILIO_AUTH_TOKEN; //The auth token for your Twilio Account
const client = require('twilio')(accountSid, authToken); //Creates an instance of Twilio using the Node.js SDK

//Read a CSV file into an array for processing (this is just a CSV mock database - it can be whatever your data source is)
fs.readFile(
  'LendingUSA.csv',
  'utf8',
  (err, data) => {
    const records = parse(data, { from_line: 2 }); //Grab the CSV records, ignoring the header record

    //Filter out any erroneous records
    let recordsToProcess = records.filter(
      (record) => record[0] != null && record[0] != ''
    );

    //Outbound Notification Trigger (this will process a notification for all records in the CSV file)
    recordsToProcess.map(async (record) => {
      await client.studio.v2
        .flows(`${process.env.TWILIO_STUDIO_FLOW_SID_BASE}`) //This will be your Twilio Studio Flow SID, which you can get from the Twilio Studio Dashboard
        .executions.create({
          to: record[2],
          from: '[YOUR TWILIO NUMBER]', //this is a Twilio number configured to send outbound notifications
          parameters: { //The parameters below map to data points in the CSV file
            firstname: record[0],
            lastname: record[1],
            phone: record[2],
            channel: record[3],
            language: record[4],
            body: record[5]
          },
        })
        .then((execution) => console.log(execution.sid));
    });
  }
);
