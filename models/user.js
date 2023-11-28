const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  githubId: String,
  username: String,
  sites: [
    {
      title: String,
      name: String,
      hostUrl: String,
      repo: String,
    },
  ],
});

module.exports = mongoose.model("user", schema);
