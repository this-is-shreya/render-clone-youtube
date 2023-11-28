const router = require("express").Router();
const {
  landing,
  successfulAuthentication,
  authentication,
} = require("../controllers/auth");

router.get("/", landing);
router.get("/github/callback", authentication);
router.get("/success", successfulAuthentication);
module.exports = router;
