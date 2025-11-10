const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

// middlewares
app.use(cors());
app.use(express.json());
const verifyFBToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

const serviceAccount = require("./import-export-hub-firebase-admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2ic5wod.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Hello Importer.😉");
});

async function run() {
  try {
    await client.connect();
    const db = client.db("ihub-db");
    const productsColl = db.collection("products");
    const importsColl = db.collection("imports");

    // product related apis
    app.get("/products", async (req, res) => {
      const cursor = productsColl.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const cursor = productsColl.find({ _id: new ObjectId(id) });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/latest-products", async (req, res) => {
      const cursor = productsColl
        .find()
        .sort({
          import_date: -1,
        })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // import related apis
    app.post("/imports", verifyFBToken, async (req, res) => {
      // update quantity
      const id = req.body.product_id;
      const import_quantity = parseInt(req.body.import_quantity);
      const product = await productsColl.findOne({ _id: new ObjectId(id) });
      const newQuantity = product.available_quantity - import_quantity;
      await productsColl.updateOne(
        { _id: new ObjectId(id) },
        { $set: { available_quantity: newQuantity } }
      );

      // import data adding to db
      const data = req.body;
      const result = await importsColl.insertOne(data);
      res.send(result);
    });

    app.get("/imports", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.importer_email = email;
      }
      const cursor = importsColl.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error. It is not for us.
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
