import express from "express";

export const router = express.Router();

router.get("/:provider", (req, res) => {
  const provider = req.params.provider.toLowerCase();
  if (provider === undefined) {
    res.status(400).json({ error: "No provider specified" });
  }

  switch (provider) {
    case "rmv":
      res.sendFile("rmv.json", { root: "assets/providers" });
      break;

    default:
      res.status(400).json({ error: "Unknown provider" });
      break;
  }
});
