import express from "express";
import dotenv from "dotenv";
import { router as gamesRouter } from "./routes/games.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/v1/games", gamesRouter);

app.listen(parseInt(process.env.HTTP_PORT), () => {
  console.log(`Listening on port ${process.env.HTTP_PORT}`);
});
