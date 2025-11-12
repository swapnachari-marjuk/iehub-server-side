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
    app.post("/products", verifyFBToken, async (req, res) => {
      const data = req.body;
      const result = await productsColl.insertOne(data);
      console.log(data);
      res.send(result);
    });

    app.get("/products", async (req, res) => {
      const cursor = productsColl.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const cursor = productsColl.find({ supplier_email: email });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products/byId/:id", async (req, res) => {
      const id = req.params.id;
      console.log("params id", id);
      const cursor = productsColl.findOne({ _id: new ObjectId(id) });
      const result = await cursor;
      res.send(result);
    });

    // check
    app.put("/products/toUpdateId/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      // console.log(query);
      const updateData = { $set: req.body };
      // console.log(req.body);
      const result = await productsColl.updateOne(query, updateData);
      // console.log(result);
      res.send(result);
    });

    // app.put("/products/toUpdateId/:id", verifyFBToken, async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const filter = { _id: new ObjectId(id) };
    //     const updateDoc = { $set: req.body };

    //     console.log("Updating product:", id);
    //     console.log("With data:", req.body);

    //     const result = await productsColl.updateOne(filter, updateDoc);

    //     if (result.modifiedCount > 0) {
    //       res.send({ success: true, message: "Product updated successfully" });
    //     } else {
    //       res.send({ success: false, message: "No document updated" });
    //     }
    //   } catch (error) {
    //     console.error("Error updating product:", error);
    //     res.status(500).send({ error: "Update failed" });
    //   }
    // });

    app.delete("/products/deleteId/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsColl.deleteOne(query);
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

    app.get("/search/:name", async (req, res) => {
      const { name } = req.params;
      const query = { product_name: { $regex: name, $options: "i" } };
      const result = await productsColl.find(query).toArray();
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

    app.delete("/imports/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await importsColl.deleteOne(query);
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
