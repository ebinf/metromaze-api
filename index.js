import express from "express";
import dotenv from "dotenv";
import { router as gamesRouter } from "./routes/games.js";
import { router as infrastructureRouter } from "./routes/infrastructure.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/v1/games", gamesRouter);
app.use("/api/v1/infrastructure", infrastructureRouter);

app.get("/api/v1/ping", (req, res) => {
  res.send("pong");
});

app.listen(parseInt(process.env.HTTP_PORT), () => {
  console.log(`Listening on port ${process.env.HTTP_PORT}`);
});
