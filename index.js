const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require("stripe")("sk_test_51OGEC6IrnYNwXzbS1rlv2eBDSOONSDc6lKiHAgxIu9zzIZfupoj6JKdg2zXiCwXOp3mjnhAaT8EEuUNuqapE8gRz00GeudZOFH")

require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const verifyToken = (req, res, next)=>{
  if(!req.headers.authorization){
    return res.status(401).send({message: "unauthorized access"});
  };

  const token = req.headers.authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
    if(err){
      return res.status(401).send({message: "unauthorized access"});
    }
    req.decoded = decoded;
    next();
  })
};






const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@jafardipu.hwlq4pv.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("bistroDB").collection("users");
    const menuCollection = client.db("bistroDB").collection("menu");
    const reviewsCollection = client.db("bistroDB").collection("reviews");
    const cartsCollection = client.db("bistroDB").collection("carts");
    const paymentsCollection = client.db("bistroDB").collection("payments");

    //middleware

    const verifyAdmin = async(req,res,next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: "forbidden"});
      };
      next();
    }

    // jwt related apis
    app.post("/jwt", async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'});  
      res.send({token})
    });

    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get("/menu/:id", async(req,res)=>{
      const id = req.params.id;
      console.log(id)
      const filter = {_id:id}
      const result = await menuCollection.findOne(filter);
      console.log(result)
      res.send(result);
    });

    app.patch("/menu/:id", async(req,res)=>{
      const item = req.body;
      const id = req.params.id;
      const query = {_id: id};
      const updatedDoc = {
        $set:{
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe
        }
      };
      const result = await menuCollection.updateOne(query,updatedDoc);
      res.send(result);
    })

    app.post('/menu', verifyToken, verifyAdmin, async (req, res)=>{
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.delete('/menu/:id', verifyToken, verifyAdmin, async(req,  res)=>{
      const id = req.params.id;
      const query = {_id: id};
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // user related apis
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;

      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user alredy exist", insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async(req, res)=>{
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: "forbidden"});
      }
      
      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === "admin";
      };
      res.send({admin});
    })

    app.patch('/users/admin/:id',verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      updatedDoc = {
        $set: {
          role: "admin"
        }
      }
      const result = await userCollection.updateOne(filter,updatedDoc);
      res.send(result);

    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // cart collection
    app.get('/carts', async (req, res) => {
      const email = req.query?.email;
      const query = { email: email }
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartsCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async(req,res)=>{
      const { price } = req.body;
      const amount = parseInt(price * 100);
     
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    //payment related apis
    app.get("/payments/:email", verifyToken, async(req,res)=>{
      const email = req.params.email;
      const query = {email: email}
      if(email !== req.decoded.email){
        return res.status(403).send("forbidden access")
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    } )

    app.post("/payments", async(req,res)=>{
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment);

      const query = {_id: {
        $in: payment?.cartIds?.map(id =>new ObjectId(id))
      }}

      const deleteResult = await cartsCollection.deleteMany(query);
      
      res.send({paymentResult, deleteResult});
    });

    // stats and analysis
    app.get("/admin-stats", verifyToken, verifyAdmin, async(req,res)=>{
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();

      // This is no a best way
      // const payments = await paymentsCollection.find().toArray();
      // const revenue = payments.reduce((total, item)=> total + item.price, 0);

      // This is best way
      const result = await paymentsCollection.aggregate([
        {
          $group: {
            _id : null,
            totalRevenue : {
              $sum : "$price"
            }
          }
        }
      ]).toArray();
      
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })

    //using aggregate pipeline
    app.get("/order-stats", verifyToken, verifyAdmin, async(req, res)=>{
      const result = await paymentsCollection.aggregate([
        {
          $unwind: "$menuIds"
        },
        {
          $lookup : {
            from: 'menu',
            localField: 'menuIds',
            foreignField: '_id',
            as: "menuItems"
          },
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: {$sum: 1},
            revenue: {$sum: "$menuItems.price"}
          }
        },
        {
          $project: {
            _id: 0,
            category: "$_id",
            quantity: "$quantity",
            revenue: "$revenue"
          }
        }
      ]).toArray();

      res.send(result); 
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("Bistro server is running");
});

app.listen(port, () => {
  console.log(`Bistro server running on port ${port}`);
});