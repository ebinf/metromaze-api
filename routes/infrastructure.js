import express from "express";
import providers from "../assets/providers/_providers.json" assert { type: "json" };

export const router = express.Router();

router.get("/", (req, res) => {
  res.json(providers);
});

router.get("/:provider", (req, res) => {
  const provider = req.params.provider.toLowerCase();
  if (provider === undefined) {
    res.status(400).json({ error: "No provider specified" });
  }

  if (!provider in providers) {
    res.status(404).json({ error: "Provider not found" });
  }

  res.sendFile(`${provider}.json`, { root: "assets/providers" });
});

router.get("/:provider/meta", (req, res) => {
  const provider = req.params.provider.toLowerCase();
  if (provider === undefined) {
    res.status(400).json({ error: "No provider specified" });
  }

  if (!provider in providers) {
    res.status(404).json({ error: "Provider not found" });
  }

  res.json(providers[provider]);
});
