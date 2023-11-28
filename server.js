const express = require("express");
const app = express();
const cookieParser = require("cookie-parser");
app.use(cookieParser());
app.set("view engine", "ejs");
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");
const whitelist = ["http://localhost:8000"];

var corsOptionsDelegate = function (req, callback) {
  var corsOptions = { origin: true };

  if (whitelist.indexOf(req.header("Origin")) !== -1) {
    corsOptions = { origin: true }; // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false }; // disable CORS for this request
  }
  callback(null, corsOptions); // callback expects two parameters: error and options
};
dotenv.config({ path: path.join(__dirname, "config.env") });

const mongoose = require("mongoose");
mongoose.connect(process.env.DATABASE, {}).then(() => {
  console.log("Database Connected");
});

app.use("/auth", cors(corsOptionsDelegate), require("./routes/auth"));
app.use("/host", cors(corsOptionsDelegate), require("./routes/host"));
app.listen(process.env.PORT, () => {
  console.log("listening at " + process.env.PORT);
});
