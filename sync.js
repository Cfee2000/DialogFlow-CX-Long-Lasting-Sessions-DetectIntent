//See here for reference file and additional Sync helper classes - https://github.com/quickstark/serverless-twilio-call-sync/blob/main/functions/sync.js
const client = require('twilio')(
  process.env.ACCOUNT_SID,
  process.env.AUTH_TOKEN
);

/**
 * Fetch and return a Sync Service
 * Creates a Sync Service if name isn't found
 *
 * @param {string} name Twilio Sync Service Name to fetch (or create)
 * @returns {Object} Sync Service Object
 */
async function fetchSyncService(name) {
  let sync_services = [];
  //Fetch existing sync services and return if one matches our env variable

  try {
    sync_services = await client.sync.services.list();

    // If we previously created this service, just return it
    let sync_service = sync_services.filter((sync_service) => {
      if (sync_service.friendlyName == name) {
        return sync_service;
      }
    });

    // If we don't have one, create and return it
    if (sync_service.length == 0) {
      sync_service = await client.sync.services.create({
        friendlyName: name,
      });
    }

    // Because we get an array from filter, let's convert to an Object
    let sync_service_obj = {};
    if (Array.isArray(sync_service)) {
      sync_service_obj = Object.assign(sync_service[0]);
    } else {
      sync_service_obj = sync_service;
    }

    return sync_service_obj;
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Fetch and return a SyncMap using Sync Service SID and name
 * or Create a new SyncMap if one doesn't exist
 *
 * @param {string} syncservicesid Twilio Sync Service SID
 * @param {string} uniquename A unique name to fetch (or create)
 * @returns {Object} SyncMap Object
 */
async function fetchSyncMap(syncservicesid, uniquename) {
  let sync_maps = [];

  try {
    sync_maps = await client.sync.services(syncservicesid).syncMaps.list();

    // If we previously created this map, just return it
    let sync_map = sync_maps.filter((sync_map) => {
      if (sync_map.uniqueName == uniquename) {
        return sync_map;
      }
    });

    // If we don't have a map, create and return it
    if (sync_map.length === 0) {
      sync_map = await client.sync
        .services(syncservicesid)
        .syncMaps.create({ uniqueName: uniquename });
    }

    // Because we get an array from filter, let's convert to an Object
    let sync_map_obj = {};
    if (Array.isArray(sync_map)) {
      sync_map_obj = Object.assign(sync_map[0]);
    } else {
      sync_map_obj = sync_map;
    }

    return sync_map_obj;
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Fetch and return the last item inserted into the Sync Map
 * as per the lexicographic ordering
 * @param {string} syncservicesid Twilio Sync Service SID
 * @param {string} uniqueName The uniqueName of the Sync Map to fetch
 * @returns {Object} SyncMapItem Object
 */
async function fetchLastMapItem(syncservicesid, uniqueName) {
  let sync_map_item = [];

  try {
    sync_map_item = await client.sync
      .services(syncservicesid)
      .syncMaps(uniqueName)
      .syncMapItems.list({ limit: 1, order: 'desc' });
    return sync_map_item;
  } catch (err) {
    if (err.code == 20404) {
      return 'Map does not exist';
    } else {
      return Promise.reject(err);
    }
  }
}

/**
 * Delete the Sync Map
 * @param {string} syncservicesid Twilio Sync Service SID
 * @param {string} uniquename The uniqueName of the Sync Map to delete
 * @returns {Boolean} true Returns true on successful delete
 */
async function deleteMap(syncservicesid, uniqueName) {
  try {
    await client.sync.services(syncservicesid).syncMaps(uniqueName).remove();
    return true;
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Fetch and return a MapItem based on a specific key
 *
 * @param {string} syncservicesid
 * @param {string} syncmapsid
 * @param {string} key
 * @returns {Object} Sync Map Item
 */
async function fetchMapItem(syncservicesid, syncmapsid, key) {
  let sync_map_item = {};

  try {
    sync_map_item = await client.sync
      .services(syncservicesid)
      .syncMaps(syncmapsid)
      .syncMapItems(key)
      .fetch();
    return sync_map_item;
  } catch (err) {
    if (err.code == 20404) {
      return 'Map Item Not Found';
    } else {
      return Promise.reject(err);
    }
  }
}

/**
 * Remove a SyncMapItem for a specific key
 *
 * https://www.twilio.com/docs/sync/api/map-item-resource#delete-a-mapitem-resource
 *
 * @param {string} syncservicesid
 * @param {string} syncmapsid
 * @param {string} key
 * @returns {string} returns "true" if MapItem was removed, or "Map Item Not Found"
 */
async function removeMapItem(syncservicesid, syncmapsid, key) {
  let sync_map_item = {};

  try {
    sync_map_item = await client.sync
      .services(syncservicesid)
      .syncMaps(syncmapsid)
      .syncMapItems(key)
      .remove();
    return sync_map_item;
  } catch (err) {
    if (err.code == 20404) {
      return 'Map Item Not Found';
    } else {
      return Promise.reject(err);
    }
  }
}
/**
 * Remove ALL SyncMapItems for a given Sync Map
 * https://www.twilio.com/docs/sync/api/map-item-resource#read-all-mapitem-resources
 *
 * @param {string} syncservicesid
 * @param {string} syncmapsid
 * @returns {string} returns "true" if MapItem was removed, or "Map Item Not Found"
 */
async function removeAllMapItems(syncservicesid, syncmapsid) {
  let sync_map_item = {};

  try {
    sync_map_item = await client.sync
      .services(syncservicesid)
      .syncMaps(syncmapsid)
      .syncMapItems.list()
      .then((items) =>
        items.forEach((i) => removeMapItem(syncservicesid, syncmapsid, i.key))
      );
    return sync_map_item;
  } catch (err) {
    if (err.code == 20404) {
      return 'Map Item Not Found';
    } else {
      return Promise.reject(err);
    }
  }
}

/**
 * Create or update a specific map item based on the key
 * Using the passed data Object
 *
 * @param {string} syncservicesid
 * @param {string} syncmapsid
 * @param {string} key
 * @param {Object} data
 * @returns {Object} Sync Map Item (created or updated)
 */
async function createOrupdateMapItem(syncservicesid, syncmapsid, key, data) {
  let sync_map_item = {};
  try {
    let mapitem = await fetchMapItem(syncservicesid, syncmapsid, key);
    if (mapitem == 'Map Item Not Found') {
      sync_map_item = await client.sync
        .services(syncservicesid)
        .syncMaps(syncmapsid)
        .syncMapItems.create({ key: key, data: data });
    } else {
      let combinedData = new Array();
      sync_map_item = await client.sync
        .services(syncservicesid)
        .syncMaps(syncmapsid)
        .syncMapItems.create({ key: key, data: data });
    }
    return sync_map_item;
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = {
  deleteMap,
  fetchLastMapItem,
  fetchSyncService,
  fetchSyncMap,
  fetchMapItem,
  removeMapItem,
  removeAllMapItems,
  createOrupdateMapItem,
};
