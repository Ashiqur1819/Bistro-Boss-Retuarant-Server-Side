const express = require("express");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_CODE);
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Middleware
app.use(cors());
app.use(express.json());

const verifyToken = (req, res, next) => {
  if(!req.headers.authorization){
    return res.status(401).send({ message: "Unauthorized Access!" });
  }
  const token = req.headers.authorization.split(" ")[1]
  
  jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {
    if(err){
      return res.status(401).send({ message: "Unauthorized Access!" });
    }else{
      req.decoded = decoded
      next()
    }
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zt90y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const menuCollection = client.db("BistroBossDB").collection("menu");
    const userCollection = client.db("BistroBossDB").collection("users");
    const reviewCollection = client.db("BistroBossDB").collection("reviews");
    const cartCollection = client.db("BistroBossDB").collection("carts");
    const paymentCollection = client.db("BistroBossDB").collection("payments");

// middlewares
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email };
  const user = await userCollection.findOne(query);
  const isAdmin = user?.role === "admin";
  if (!isAdmin) {
    return res.status(403).send("Forbidden Access!");
  }
  next();
};


    app.post("/jwt", async(req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_TOKEN, {expiresIn: "7d"});
      res.send({token})
    })

    // user collection
    app.get("/users", verifyToken, verifyAdmin, async(req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    app.get("/users/admin/:email", verifyToken, async(req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access!" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    })

    app.post("/users", async(req, res) => {
      const user = req.body;
      const query = {email : user?.email}
      const isExist = await userCollection.findOne(query)
      if(isExist){
        return res.send({message: "User already exists in database"})
      }
      const result = await userCollection.insertOne(user);
      res.send(result)
    })

    app.delete("/users/:email", async(req, res) => {
      const email = req.params.email
      const query = {email : email}
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })

    app.patch("/users/:email", async(req, res) => {
      const email = req.params.email
      const filter = {email : email}
      const updatedDoc = {
        $set: {
          role : "admin"
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })


    // menu collection
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get("/menu/:id", async(req, res) => {
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await menuCollection.findOne(query)
      res.send(result)
    })

    app.post("/menu", verifyToken, verifyAdmin, async(req, res) => {
      const menuItem = req.body;
      const result = await menuCollection.insertOne(menuItem)
      res.send(result)
    })

    app.patch("/menu/:id", async(req, res) => {
      const id = req.params.id
      const item = req.body
      const filter = {_id : new ObjectId(id)}
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
        },
      };
      const result= await menuCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })


    app.delete("/menu/:id", async(req, res) => {
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await menuCollection.deleteOne(query)
      res.send(result)
    })

    // review collection
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // cart collection

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = {email : email}
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete("/carts/:id", async(req, res) => {
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })


    // Payment apis
    app.post("/create-payment-intent", async(req, res) => {
      const {price} = req.body;
      const amount = parseInt(price * 100)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"]
      });

      res.send({
        clientSecret : paymentIntent.client_secret
      })
    })


    app.get("/payments/:email", verifyToken, async(req, res) => {
      const email = req.params.email;
      const query = {email : email}
      if(email !== req.decoded.email){
        res.status(403).send({message: "Forbidden Access!"})
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result)
    })

    app.post("/payments", async(req, res) => {
      const payment = req.body
      console.log("Payment", payment)
      const paymentResult = await paymentCollection.insertOne(payment)

      // Empty cart
      const query = {_id : {
        $in : payment.cartIds.map(id => new ObjectId(id))
      }}

      const deleteResult = await cartCollection.deleteMany(query)

      res.send({paymentResult, deleteResult});
    })

    // Admin analytics 
    app.get("/admin-stats", async(req, res) => {
      const users = await userCollection.estimatedDocumentCount()
      const menuItems = await menuCollection.estimatedDocumentCount()
      const orders = await paymentCollection.estimatedDocumentCount()

      // const payments = await paymentCollection.find().toArray()
      // const payment = payments.reduce(
      //   (total, payment) => total + payment.price,
      //   0
      // );

      const result = await paymentCollection.aggregate([
        {
          $group : {
            _id : null,
            totalRevenue : {$sum : "$price"}
          }
        }
      ]).toArray()
      console.log(result)
      const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0

      res.send({ users, menuItems, orders, totalRevenue });
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("The server running successfully!");
});

app.listen(port, () => {
  console.log("The server running successfully!");
});
