import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const app = express();

const topicAccess = {
  Deny: 0,
  Read: 1,
  Write: 2,
  ReadWrite: 3,
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function generateRandomSecret() {
  return (
    Math.random().toString(36).substring(2, 22) +
    Math.random().toString(36).substring(2, 22)
  );
}

app.get("/api/v1/create", async (req, res) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  console.log(`Creating game ${code}`);

  const secret = generateRandomSecret();

  var broker = 0;
  if (process.env.MQTT_NUM_BROKERS > 1) {
    const brokerEvaluation = await prisma.game.groupBy({
      select: {
        broker: true,
      },
      orderBy: {
        _count: {
          broker: "asc",
        },
      },
      where: {
        broker: {
          lt: parseInt(process.env.MQTT_NUM_BROKERS),
        },
      },
      by: ["broker"],
    });
    if (brokerEvaluation.length > 0) {
      broker = brokerEvaluation[0].broker;
    }
    for (var i = 0; i < process.env.MQTT_NUM_BROKERS; i++) {
      if (!brokerEvaluation.find((e) => e.broker === i)) {
        broker = i;
        break;
      }
    }
  }
  console.log(`> Using broker: ${broker}`);
  bcrypt
    .hash(secret, parseInt(process.env.BCRYPT_ROUNDS))
    .then(async (hash) => {
      await prisma.game.create({
        data: {
          code: code,
          expires: new Date(new Date().getTime() + 60 * 60 * 1000), // 1 hour for starting of the game
          started: false,
          broker: broker,
          User: {
            create: {
              username: `${code}-${req.get("client-id")}`,
              secret: hash,
              lead: true,
              Topic: {
                createMany: {
                  data: [
                    {
                      topic: `game/${code}/settings`,
                      access: topicAccess.Write,
                    },
                    {
                      topic: `game/${code}/chat`,
                      access: topicAccess.ReadWrite,
                    },
                    {
                      topic: `game/${code}/broadcast`,
                      access: topicAccess.Write,
                    },
                    {
                      topic: `game/${code}/#`,
                      access: topicAccess.Read,
                    },
                    {
                      topic: `game/${code}/device/+/chat`,
                      access: topicAccess.Deny,
                    },
                  ],
                },
              },
            },
          },
        },
      });
      res.json({
        code: code,
        username: `${code}-${req.get("client-id")}`,
        secret: secret,
        mqtt_server: process.env[`MQTT_${broker}_HOST`],
        mqtt_port: process.env[`MQTT_${broker}_PORT`],
      });
    })
    .catch((e) => {
      console.error(e);
      return res.status(500).json({
        error: "Internal server error",
      });
    });
});

app.get("/api/v1/game/:code/join", async (req, res) => {
  const code = req.params.code.toUpperCase();
  console.log(`Joining game ${code}`);
  const game = await prisma.game.findUnique({
    where: {
      code: code,
    },
  });
  if (!game) {
    return res.status(404).json({
      error: "Game not found",
    });
  }
  if (game.started) {
    return res.status(400).json({
      error: "Game already started",
    });
  }

  const secret = generateRandomSecret();

  bcrypt
    .hash(secret, parseInt(process.env.BCRYPT_ROUNDS))
    .then(async (hash) => {
      const createUser = await prisma.user.create({
        data: {
          username: `${code}-${req.get("client-id")}`,
          secret: hash,
          lead: false,
          game: {
            connect: {
              id: game.id,
            },
          },
          Topic: {
            createMany: {
              data: [
                {
                  topic: `game/${code}/#`,
                  access: topicAccess.Read,
                },
                {
                  topic: `game/${code}/chat`,
                  access: topicAccess.ReadWrite,
                },
                {
                  topic: `game/${code}/device/${req.get("client-id")}/+`,
                  access: topicAccess.Write,
                },
                {
                  topic: `game/${code}/device/${req.get("client-id")}/chat`,
                  access: topicAccess.Read,
                },
                {
                  topic: `game/${code}/emergency`,
                  access: topicAccess.ReadWrite,
                },
                {
                  topic: `game/${code}/redeem_joker`,
                  access: topicAccess.Write,
                },
                {
                  topic: `game/${code}/searched_broadcast`,
                  access: topicAccess.Read,
                },
                {
                  topic: `game/${code}/searching_chat`,
                  access: topicAccess.Deny,
                },
                {
                  topic: `game/${code}/device/+/location`,
                  access: topicAccess.Deny,
                },
                {
                  topic: `game/${code}/device/+/chat`,
                  access: topicAccess.Write,
                },
                {
                  topic: `game/${code}/device/+/info`,
                  access: topicAccess.Read,
                },
              ],
            },
          },
        },
      });

      if (!createUser) {
        return res.status(400).json({
          error: "Could not create user",
        });
      }

      res.json({
        code: code,
        username: `${code}-${req.get("client-id")}`,
        secret: secret,
        mqtt_server: process.env[`MQTT_${game.broker}_HOST`],
        mqtt_port: process.env[`MQTT_${game.broker}_PORT`],
      });
    })
    .catch((e) => {
      console.error(e);
      return res.status(500).json({
        error: "Internal server error",
      });
    });
});

app.post("/api/v1/game/:code/start", async (req, res) => {
  const code = req.params.code.toUpperCase();
  console.log(`Starting game ${code}`);
  const auth = req.get("Authorization");
  if (!auth) {
    return res.status(401).json({
      error: "Authorization required",
    });
  }
  const [username, secret] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");
  const user = await prisma.user.findUnique({
    where: {
      username: username,
    },
    include: {
      game: true,
    },
  });
  const match = await bcrypt.compare(secret, user.secret);
  if (!user || !match) {
    return res.status(401).json({
      error: "Authorization required",
    });
  }
  if (user.game.code !== code || !user.lead) {
    return res.status(403).json({
      error: "Forbidden",
    });
  }

  const game = await prisma.game.findUnique({
    where: {
      code: code,
    },
  });

  if (!game) {
    return res.status(404).json({
      error: "Game not found",
    });
  }
  if (game.started) {
    return res.status(400).json({
      error: "Game already started",
    });
  }

  if (req.body.mode === "COOPERATIVE") {
    await prisma.topic.updateMany({
      data: {
        access: topicAccess.ReadWrite,
      },
      where: {
        topic: `game/${code}/searching_chat`,
        user: {
          game: {
            code: code,
          },
          lead: false,
          NOT: {
            username: `${code}-${req.body.searched}`,
          },
        },
      },
    });

    await prisma.topic.updateMany({
      data: {
        access: topicAccess.Read,
      },
      where: {
        topic: `game/${code}/device/+/location`,
        user: {
          game: {
            code: code,
          },
          lead: false,
          NOT: {
            username: `${code}-${req.body.searched}`,
          },
        },
      },
    });
  }

  const searchedUpdate = await prisma.user.update({
    where: {
      username: `${code}-${req.body.searched}`,
    },
    data: {
      Topic: {
        updateMany: [
          {
            data: {
              access: topicAccess.Read,
            },
            where: {
              username: `${code}-${req.body.searched}`,
              topic: `game/${code}/redeem_joker`,
            },
          },
          {
            data: {
              access: topicAccess.Write,
            },
            where: {
              username: `${code}-${req.body.searched}`,
              topic: `game/${code}/searched_broadcast`,
            },
          },
        ],
      },
    },
  });

  if (!searchedUpdate) {
    return res.status(404).json({
      error: "User not found",
    });
  }

  await prisma.game.update({
    where: {
      code: code,
    },
    data: {
      started: true,
      expires: new Date(new Date().getTime() + req.body.duration * 60 * 1000),
      mode: req.body.mode,
    },
  });

  res.json({
    message: "Game started",
  });
});

app.listen(parseInt(process.env.HTTP_PORT), () => {
  console.log(`Server is running on port ${process.env.HTTP_PORT}`);
});
