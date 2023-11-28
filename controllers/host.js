const userSchema = require("../models/user");
const axios = require("axios");
const request = require("request");
const extract = require("extract-zip");
const pulumi = require("@pulumi/pulumi");
const awsx = require("@pulumi/awsx");
const aws = require("@pulumi/aws");
const docker = require("@pulumi/docker");
const auto = require("@pulumi/pulumi/automation");
const fse = require("fs-extra");
const path = require("path");
const fs = require("fs");
const { addObjectToS3 } = require("../utils/addObjectToS3");

module.exports.home = async (req, res) => {
  try {
    const userData = await userSchema.find({ githubId: req.cookies.id });
    res.render("home", { userData: userData[0] });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};
module.exports.message = async (req, res) => {
  try {
    // const userData = await userSchema.find({ githubId: req.cookies.id });
    res.render("message");
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};

module.exports.staticSite = async (req, res) => {
  try {
    //host static.ejs
    //send all the repositories of the logged in user
    axios({
      method: "get",
      url: `https://api.github.com/user/repos`,
      headers: {
        Authorization: "token " + req.cookies.access_token,
        "X-GitHub-Api-Version": "2022-11-28",
        Accept: "application/vnd.github+json",
      },
    }).then((response) => {
      res.render("staticSite", { repo: response.data, state: "new" });
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};
module.exports.hostStaticSite = async (req, res) => {
  try {
    //fetch repo contents
    //extract the zip file
    //delete the zip file
    //send everything to pulumiStatic
    await fse
      .emptyDir(path.join(__dirname, "/../userAppStatic"))
      .then(() => {
        console.log("emptied the contents of userAppStatic!");
      })
      .catch((err) => {
        console.error(err);
      });
    let { title, branch, repo } = req.body;
    console.log(req.body);
    const userData = await userSchema.find({ githubId: req.cookies.id });
    axios({
      method: "get",
      url: `https://api.github.com/repos/${userData[0].username}/${repo}/zipball/${branch}`,
      headers: {
        Authorization: "token " + req.cookies.access_token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }).then(async (response) => {
      const userApp = path.join(__dirname, "/../userAppStatic");
      const target = path.join(__dirname, "/../userAppStatic/bootstrap.zip");

      request(
        { url: response.request.res.responseUrl, encoding: null },
        function (err, resp, body) {
          if (err) throw err;
          fs.writeFile(target, body, async function (err) {
            console.log("file written!");

            await extract(target, { dir: userApp });

            fs.unlink(target, (err) => {
              if (err) console.log(err);
              console.log("deleted bootstrap.zip");
            });
            fs.readdir(userApp, async (err, data) => {
              if (err) console.log(err);
              console.log("file->", data);

              if (data.length > 1 && data[0] == "bootstrap.zip") data.shift();
              else if (data.length > 1 && data[1] == "bootstrap.zip")
                data.pop();
              res.redirect("/host/message");

              const path1 = path.join(
                __dirname,
                "/../userAppStatic/" + data[0]
              );
              const path2 = path.join(
                __dirname,
                "/../userAppStatic/" +
                  data[0] +
                  "," +
                  title +
                  "," +
                  req.cookies.id +
                  "," +
                  repo +
                  "," +
                  req.params.state
              );
              fs.rename(path1, path2, (err) => {
                if (err) console.log(err);
                console.log("renamed");
              });
              //pulumi
              const stack = await auto.LocalWorkspace.selectStack({
                stackName: "demo",
                projectName: "free-hosting",
                program: pulumiStatic,
              });
              await stack.workspace.installPlugin("aws", "v4.0.0");
              await stack.up({ onOutput: console.info() });
            });
          });
        }
      );
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};
const pulumiStatic = async () => {
  try {
    let filePath, filename, title, githubId, repo, state;
    filePath = path.join(__dirname, "/../userAppStatic/");

    fs.readdir(filePath, async function (err, files) {
      if (err) console.log(err);
      else {
        filename = files[0];
        filePath = path.join(__dirname, "/../userAppStatic/" + filename);
        filename = filename.split(",");
        title = filename[1];
        githubId = filename[2];
        repo = filename[3];
        state = filename[4];
        console.log(title, githubId, repo, state);
        let siteBucket = new aws.s3.Bucket(githubId + "-" + title, {
          website: {
            indexDocument: "index.html",
          },
        });

        const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
          "public-access-block",
          {
            bucket: siteBucket.id,
            blockPublicAcls: false,
          }
        );
        console.log("past this");

        // Create an S3 Bucket Policy to allow public read of all objects in bucket
        function publicReadPolicyForBucket(bucketName) {
          return {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: "*",
                Action: ["s3:GetObject"],
                Resource: [
                  `arn:aws:s3:::${bucketName}/*`, // policy refers to bucket name explicitly
                ],
              },
            ],
          };
        }

        // Set the access policy for the bucket so all objects are readable
        let bucketPolicy = new aws.s3.BucketPolicy(
          "bucketPolicy",
          {
            bucket: siteBucket.bucket, // refer to the bucket created earlier
            policy: siteBucket.bucket.apply(publicReadPolicyForBucket), // use output property `siteBucket.bucket`
          },
          { dependsOn: publicAccessBlock }
        );
        console.log("created policy");

        siteBucket.websiteEndpoint.apply(async (websiteEndpoint) => {
          siteBucket.bucket.apply(async (bucket) => {
            // For each file in the directory, create an S3 object stored in `siteBucket`
            console.log(bucket);
            await addObjectToS3(filePath, bucket, "", title + "-" + githubId);
            console.log("created object");
            if (state && state == "new") {
              await userSchema.findOneAndUpdate(
                { githubId: githubId },
                {
                  $push: {
                    sites: {
                      title: title,
                      name: bucket,
                      hostUrl: websiteEndpoint,
                      repo: repo,
                    },
                  },
                }
              );
            }
          });
          console.log(websiteEndpoint);
        });
      }
    });
  } catch (error) {
    return {
      success: false,
      message: error,
    };
  }
};
module.exports.webService = async (req, res) => {
  try {
    axios({
      method: "get",
      url: `https://api.github.com/user/repos`,
      headers: {
        Authorization: "token " + req.cookies.access_token,
      },
    }).then((response) => {
      res.render("webService", { repo: response.data, state: "new" });
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};
module.exports.hostWebService = async (req, res) => {
  try {
    await fse
      .emptyDir(path.join(__dirname, "/../userApp"))
      .then(() => {
        console.log("emptied the contents of userApp!");
      })
      .catch((err) => {
        console.error(err);
      });
    let { title, branch, repo, root, runtime, version, build, start, env } =
      req.body;

    console.log(runtime);
    const userData = await userSchema.find({ githubId: req.cookies.id });
    axios({
      method: "get",
      url: `https://api.github.com/repos/${userData[0].username}/${repo}/zipball/${branch}`,
      headers: {
        Authorization: "token " + req.cookies.access_token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }).then(async (response) => {
      const userApp = path.join(__dirname, "/../userApp");
      const target = path.join(__dirname, "/../userApp/bootstrap.zip");

      request(
        { url: response.request.res.responseUrl, encoding: null },
        function (err, resp, body) {
          if (err) throw err;
          fs.writeFile(target, body, async function (err) {
            console.log("file written!");

            await extract(target, { dir: userApp });

            fs.unlink(target, (err) => {
              if (err) console.log(err);
              console.log("deleted bootstrap.zip");
            });
            fs.readdir(userApp, (err, data) => {
              if (err) console.log(err);
              console.log("file->", data);

              let envJson = [];
              env.split("\n").forEach((ele) => {
                ele = ele.split("=");
                envJson.push({ name: ele[0], value: ele[1] });
              });
              envJson.push({ name: "PORT", value: "80" });

              if (data.length > 1 && data[0] == "bootstrap.zip") data.shift();
              else if (data.length > 1 && data[1] == "bootstrap.zip")
                data.pop();

              fse
                .writeJSON(
                  path.join(
                    __dirname,
                    "/../userApp/" + data[0] + "/config.json"
                  ),
                  envJson
                )
                .then(() => {
                  console.log("success!");
                })
                .catch((err) => {
                  console.error(err);
                });

              const filename = path.join(
                __dirname,
                "/../userApp/" + data[0] + "/Dockerfile"
              );
              const content = `FROM ${runtime}:${version}
COPY ${root} /app
WORKDIR /app
RUN ${build}
CMD ${start}`;
              res.redirect("/host/message");

              fs.writeFile(filename, content, async (err) => {
                if (err) console.log(err);
                console.log("Dockerfile created");
                const path1 = path.join(__dirname, "/../userApp/" + data[0]);
                const path2 = path.join(
                  __dirname,
                  "/../userApp/" +
                    data[0] +
                    "," +
                    title +
                    "," +
                    req.cookies.id +
                    "," +
                    repo +
                    "," +
                    req.params.state
                );
                fs.rename(path1, path2, (err) => {
                  if (err) console.log(err);
                  console.log("renamed");
                });
                const stack = await auto.LocalWorkspace.selectStack({
                  stackName: "demo",
                  projectName: "free-hosting",
                  program: pulumiProgram,
                });
                await stack.workspace.installPlugin("aws", "v4.0.0");
                await stack.up({ onOutput: console.info() }); //pulumi up
              });
            });
          });
        }
      );
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};
const pulumiProgram = async () => {
  try {
    let filePath, filename, title, githubId, state, repository;

    filePath = path.join(__dirname, "/../userApp/");
    fs.readdir(filePath, async function (err, files) {
      if (err) {
        // some sort of error
        console.log(err);
      } else if (files.length > 0) {
        filename = files[0];
        filePath = path.join(__dirname, "/../userApp/" + filename);
        filename = filename.split(",");
        title = filename[1];
        githubId = filename[2];
        repository = filename[3];
        state = filename[4];

        console.log("here it is..", filePath);
        console.log(title, githubId);

        const tag = githubId + "-" + title;
        let repo = aws.ecr.getRepository({ name: process.env.ECR_REPO_NAME });

        await repo
          .then(async (r) => {
            const registry = pulumi
              .output(r.registryId)
              .apply(async (registryId) => {
                const credentials = await aws.ecr.getCredentials({
                  registryId,
                });
                const decodedCredentials = Buffer.from(
                  credentials.authorizationToken,
                  "base64"
                ).toString();
                const [username, password] = decodedCredentials.split(":");
                // console.log(
                //   "proxy: ",
                //   credentials.proxyEndpoint,
                //   " username: ",
                //   username,
                //   " password: ",
                //   password
                // );
                return {
                  server: credentials.proxyEndpoint,
                  username: username,
                  password: password,
                };
              });
            const image = new docker.Image(tag, {
              imageName: pulumi.interpolate`${r.repositoryUrl}:${tag}`,
              build: {
                context: filePath, // Specify the local folder with your Dockerfile and app
              },
              registry: registry,
            });

            const cluster = await aws.ecs.getCluster(
              {
                clusterName: process.env.ECS_CLUSTER_NAME,
              },
              { async: true }
            );

            console.log("pasttt ittt");

            const lb = new awsx.lb.ApplicationLoadBalancer(tag, {
              securityGroups: [process.env.SECURITY_GROUP],
            });
            // Create a Log Group

            let logGroup = new aws.cloudwatch.LogGroup("app-log-group", {});
            // console.log("arn--->", cluster.arn);
            fse
              .readJSON(path.join(filePath, "/config.json"))
              .then((envJson) => {
                console.log(
                  "e->",
                  envJson,
                  "string->",
                  JSON.stringify(envJson)
                );

                const service = new awsx.ecs.FargateService(
                  tag,

                  {
                    cluster: cluster.arn,
                    assignPublicIp: true,
                    taskDefinitionArgs: {
                      container: {
                        image: pulumi.interpolate`${process.env.ECR}:${tag}`,
                        cpu: 128,
                        memory: 2048,

                        portMappings: [
                          {
                            containerPort: 80,
                            targetGroup: lb.defaultTargetGroup,
                          },
                        ],
                        environment: envJson,
                        logConfiguration: {
                          logDriver: "awslogs", // AWS logging driver
                          options: {
                            "awslogs-group": logGroup.name, // Use log group we created
                            "awslogs-region": "eu-north-1",
                            "awslogs-stream-prefix": "webserver",
                          },
                        },
                      },
                    },
                    continueBeforeSteadyState: true,
                    desiredCount: 2,
                  }
                );
              });
            lb.loadBalancer.dnsName.apply(async (dnsName) => {
              console.log(`dns name is ${dnsName}`);
              image.imageName.apply(async (imageName) => {
                if (state == "new") {
                  await userSchema.findOneAndUpdate(
                    { githubId: githubId },
                    {
                      $push: {
                        sites: {
                          title: title,
                          name: imageName,
                          hostUrl: dnsName,
                          repo: repository,
                        },
                      },
                    }
                  );
                }
              });
            });
          })
          .catch((error) => {
            console.log("error:", error);
          });
      }
    });
  } catch (error) {
    console.log(error);
  }
};
module.exports.editService = async (req, res) => {
  try {
    const data = await userSchema.findOne(
      {
        sites: { $elemMatch: { title: req.params.title } },
      },
      { "sites.$": 1 }
    );
    if (data.sites[0].hostUrl.includes(".s3-website.")) {
      res.render("staticSite", {
        repo: data.sites[0].repo,
        state: "update",
        title: req.params.title,
      });
    } else {
      res.render("webService", {
        repo: data.sites[0].repo,

        state: "update",
        title: req.params.title,
      });
    }

    console.log(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};
module.exports.deleteAll = async (req, res) => {
  try {
    const stack = await auto.LocalWorkspace.selectStack({
      stackName: "demo",
      projectName: "free-hosting",
      program: pulumiProgram,
    });
    await userSchema.updateMany({}, { $set: { sites: [] } });
    await stack.destroy({ onOutput: console.info() });
    res.redirect("/auth");
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error, " + error,
    });
  }
};
