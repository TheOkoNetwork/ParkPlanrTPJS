const fetch = require('node-fetch');

const { MongoClient } = require("mongodb");
// Connection URI
const mongoUrl =
  `mongodb+srv://tpjs:${process.env.TPJS_MONGO_PASSWORD}@freesolvecluster.fdio4.mongodb.net/projectcamelot-dev?retryWrites=true&w=majority`;
  let client;

  async function run() {
        global.ObjectId = require("mongodb").ObjectId;
        console.log("Connecting to mongoDB");
        client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
        console.log("Appears to be connected");
        global.db = client.db("projectcamelot-dev");
        await populateRidesCache();
        fetchQueues();
}
const ridesCache = {};
const populateRidesCache = async function() {
    const rideIds = await db.collection("attractionridelivehistory").distinct("id");
    const ridePromises = [];
    for (const rideId of rideIds) {
        ridePromises.push(db.collection("attractionridelivehistory").find({id: rideId}).sort({_id: -1}).limit(1).toArray());
    }
    const rides = await Promise.all(ridePromises);
    for (const ride of rides) {
      ridesCache[ride[0].id] = ride[0];
    }
}
const fetchQueues = async function() {
    const destinations = await global.db.collection('attractionride').distinct("destinationId");
    console.log(destinations);
    const destinationPromises = [];
    for (const destinationId of destinations) {
        console.log(destinationId);
        destinationPromises.push(
            fetch(`https://api.themeparks.wiki/v1/entity/${destinationId}/live`)
        );
    };
    const destinationsRes = await Promise.all(destinationPromises);
    const destinationsData = await Promise.all(destinationsRes.map(res => res.json()));
    const liveData = destinationsData.map(function(destinationData) {
        return destinationData.liveData;
    }).flat();
    //console.log(liveData);

    for (const ride of liveData) {
      let pushToMongo = false;
      if (ridesCache[ride.id]) {
        //console.log("Already in cache");
        if (ridesCache[ride.id].lastUpdated !== ride.lastUpdated) {
          console.log(`New last updated value of: ${ride.lastUpdated} compared to: ${ridesCache[ride.id].lastUpdated} ${ridesCache[ride.id]._id}`);
          pushToMongo = true;
        }
      } else {
        console.log("Not in cache");
        pushToMongo = true;
      }

      if (pushToMongo) {
        console.log(`Need to push ride: ${ride.id} (${ride.name}) to mongo`);
        if (!ride.queue) {
            ride.queue = {
                STANDBY: {
                    waitTime: 0,
                }
            }
        }

        console.log(ride);
        await db.collection("attractionridelivehistory").insertOne(ride);
        ridesCache[ride.id] = ride;
      }
    };

    setTimeout(fetchQueues, 1000 * 60);
}
run().catch(console.dir);