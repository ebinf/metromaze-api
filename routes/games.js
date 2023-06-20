import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import generator from "generate-password";

dotenv.config();

const prisma = new PrismaClient();

const clientSecretConfig = {
  length: 32,
  numbers: true,
  symbols: false,
  uppercase: true,
  lowercase: true,
};

export const router = express.Router();

function clientIdToUsername(code, clientId) {
  return `${code}-${clientId}`;
}

async function findBrokerWithLowestUsage() {
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
    for (var i = 0; i < process.env.MQTT_NUM_BROKERS; i++) {
      if (!brokerEvaluation.find((e) => e.broker === i)) {
        return i;
      }
    }
    return brokerEvaluation[0].broker;
  }
  return 0;
}

router.get("/create", async (req, res) => {
  if (req.get("client-id") === undefined) {
    return res.status(400).json({
      error: "client-id missing",
    });
  }

  const broker = await findBrokerWithLowestUsage();
  const code = generator.generate({
    length: 6,
    numbers: true,
    uppercase: true,
    lowercase: false,
    symbols: false,
  });
  const username = clientIdToUsername(code, req.get("client-id"));
  const secret = generator.generate(clientSecretConfig);
  const secretHash = await bcrypt.hash(
    secret,
    parseInt(process.env.BCRYPT_SALT_ROUNDS ?? 10)
  );
  console.log(`Creating game ${code} on broker ${broker}`);

  try {
    await prisma.game.create({
      data: {
        code: code,
        expires: new Date(Date.now() + 1000 * 60 * 60), // 1 hour for starting of the game
        broker: broker,
        started: false,
        User: {
          create: {
            username: username,
            secret: secretHash,
            lead: true,
            Topic: {
              createMany: {
                data: [
                  {
                    topic: `game/${code}/settings`,
                    access: "WRITE",
                  },
                  {
                    topic: `game/${code}/broadcast`,
                    access: "WRITE",
                  },
                  {
                    topic: `game/${code}/emergency`,
                    access: "READ_WRITE",
                  },
                  {
                    topic: `game/${code}/searched_broadcast`,
                    access: "READ",
                  },
                  {
                    topic: `game/${code}/redeem_joker`,
                    access: "READ",
                  },
                  {
                    topic: `game/${code}/chat/all`,
                    access: "READ_WRITE",
                  },
                  {
                    topic: `game/${code}/chat/device/+`,
                    access: "WRITE",
                  },
                  {
                    topic: `game/${code}/chat/device/${req.get("client-id")}`,
                    access: "READ",
                  },
                  {
                    topic: `game/${code}/devices/+/info`,
                    access: "READ",
                  },
                  {
                    topic: `game/${code}/devices/+/location`,
                    access: "READ",
                  },
                  {
                    topic: `game/${code}/devices/${req.get("client-id")}/info`,
                    access: "WRITE",
                  },
                ],
              },
            },
          },
        },
      },
    });
  } catch (e) {
    console.log(e);
    return res.status(500).json({
      error: "Internal server error",
    });
  }

  res.json({
    code: code,
    username: username,
    secret: secret,
    server: process.env[`MQTT_${broker}_HOST`],
    port: process.env[`MQTT_${broker}_PORT`],
  });
});

router.get("/:code/join", async (req, res) => {
  if (req.get("client-id") === undefined) {
    return res.status(400).json({
      error: "client-id missing",
    });
  }
  const code = req.params.code.toUpperCase();
  const username = clientIdToUsername(code, req.get("client-id"));
  const secret = generator.generate(clientSecretConfig);
  const secretHash = await bcrypt.hash(
    secret,
    parseInt(process.env.BCRYPT_SALT_ROUNDS ?? 10)
  );

  const game = await prisma.game.findUnique({
    where: {
      code: code,
    },
    include: {
      User: true,
    },
  });

  if (game === null) {
    return res.status(404).json({
      error: "Game not found",
    });
  }

  if (game.started) {
    return res.status(410).json({
      error: "Game already started",
    });
  }

  if (game.User.length > process.env.MAX_PLAYERS ?? 10) {
    return res.status(409).json({
      error: "Game is full",
    });
  }

  try {
    await prisma.user.create({
      data: {
        username: username,
        secret: secretHash,
        lead: false,
        game: {
          connect: {
            code: code,
          },
        },
        Topic: {
          createMany: {
            data: [
              {
                topic: `game/${code}/settings`,
                access: "READ",
              },
              {
                topic: `game/${code}/broadcast`,
                access: "READ",
              },
              {
                topic: `game/${code}/emergency`,
                access: "READ_WRITE",
              },
              {
                topic: `game/${code}/searched_broadcast`,
                access: "READ",
              },
              {
                topic: `game/${code}/redeem_joker`,
                access: "WRITE",
              },
              {
                topic: `game/${code}/chat/all`,
                access: "READ_WRITE",
              },
              {
                topic: `game/${code}/chat/device/+`,
                access: "WRITE",
              },
              {
                topic: `game/${code}/chat/device/${req.get("client-id")}`,
                access: "READ",
              },
              {
                topic: `game/${code}/devices/+/info`,
                access: "READ",
              },
              {
                topic: `game/${code}/devices/${req.get("client-id")}/info`,
                access: "WRITE",
              },
              {
                topic: `game/${code}/devices/${req.get("client-id")}/location`,
                access: "WRITE",
              },
            ],
          },
        },
      },
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({
        error: "Username already exists",
      });
    }
    console.log(
      `Error while user "${req.get("client-id")}" joining game ${code}:`,
      e
    );
    return res.status(500).json({
      error: "Internal server error",
    });
  }

  res.json({
    code: code,
    username: username,
    secret: secret,
    server: process.env[`MQTT_${game.broker}_HOST`],
    port: process.env[`MQTT_${game.broker}_PORT`],
  });
});

router.post("/:code/start", async (req, res) => {
  const code = req.params.code.toUpperCase();

  if (
    req.body.mode === undefined ||
    ["COMPETITIVE", "COOPERATIVE"].indexOf(req.body.mode.toUpperCase()) ===
      -1 ||
    req.body.duration === undefined ||
    isNaN(req.body.duration) ||
    req.body.duration < 30 ||
    req.body.duration > 1440 ||
    req.body.duration % 15 !== 0 ||
    req.body.searched === undefined
  ) {
    return res.status(400).json({
      error: "Invalid request body",
    });
  }

  const auth = req.get("authorization");
  if (auth === undefined) {
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
  if (!user) {
    return res.status(401).json({
      error: "Username or password invalid",
    });
  }

  const match = await bcrypt.compare(secret, user.secret);
  if (!match) {
    return res.status(401).json({
      error: "Username or password invalid",
    });
  }

  if (user.game.code !== code || !user.lead) {
    return res.status(403).json({
      error: "Forbidden",
    });
  }

  if (user.game.started) {
    return res.status(409).json({
      error: "Game already started",
    });
  }

  const searchedUser = await prisma.user.findUnique({
    where: {
      username: `${code}-${req.body.searched}`,
    },
  });

  if (!searchedUser) {
    return res.status(404).json({
      error: "Searched user not found",
    });
  }

  const gameUsers = await prisma.user.findMany({
    where: {
      game: {
        code: code,
      },
      NOT: {
        username: searchedUser.username,
      },
    },
  });

  const cooperativeChatTopics = gameUsers.map((user) => {
    return {
      username: user.username,
      topic: `game/${code}/chat/searching`,
      access: "READ_WRITE",
    };
  });

  const gameUsersWithoutLead = gameUsers.filter((user) => !user.lead);
  const cooperativeLocationTopics = gameUsersWithoutLead.map((user) => {
    return gameUsersWithoutLead
      .filter((locator) => locator.username != user.username)
      .map((locator) => {
        return {
          username: user.username,
          topic: `game/${code}/devices/${locator.username.substr(
            code.length + 1
          )}/location`,
          access: "READ",
        };
      });
  });

  const expiry = new Date(new Date().getTime() + req.body.duration * 60 * 1000);

  try {
    await prisma.user.update({
      where: {
        username: searchedUser.username,
      },
      data: {
        Topic: {
          updateMany: [
            {
              data: {
                access: "READ",
              },
              where: {
                username: searchedUser.username,
                topic: `game/${code}/redeem_joker`,
              },
            },
            {
              data: {
                access: "WRITE",
              },
              where: {
                username: searchedUser.username,
                topic: `game/${code}/searched_broadcast`,
              },
            },
          ],
        },
      },
    });

    if (req.body.mode.toUpperCase() === "COOPERATIVE") {
      await prisma.topic.createMany({
        data: [...cooperativeChatTopics, ...cooperativeLocationTopics.flat()],
        skipDuplicates: true,
      });
    }

    await prisma.game.update({
      where: {
        code: code,
      },
      data: {
        started: true,
        expires: expiry,
        mode: req.body.mode.toUpperCase(),
      },
    });
  } catch (e) {
    console.log(e);
    return res.status(500).json({
      error: "Internal server error",
    });
  }

  res.json({
    expires: expiry,
  });
});
