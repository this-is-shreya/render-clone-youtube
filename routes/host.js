const { checkAuthenticated } = require("../controllers/auth");
const {
  home,
  staticSite,
  hostStaticSite,
  message,
  webService,
  hostWebService,
  editService,
  deleteAll,
} = require("../controllers/host");

const router = require("express").Router();

router.get("/", checkAuthenticated, home);
router.get("/static", checkAuthenticated, staticSite);
router.post("/static/static/:state", checkAuthenticated, hostStaticSite);
router.get("/message", checkAuthenticated, message);

router.get("/webService", checkAuthenticated, webService);
router.post("/webService/web/:state", checkAuthenticated, hostWebService);

router.get("/edit/:title", checkAuthenticated, editService);
router.get("/delete", checkAuthenticated, deleteAll);
module.exports = router;
