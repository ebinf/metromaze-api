import fs from "fs";
import csv from "csvtojson";

async function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error("No file specified");
  }
  const jsonData = await csv({
    delimiter: ";",
  }).fromFile(file);
  var relevantInfo = [];
  for (const row of jsonData) {
    relevantInfo.push({
      name: row["NAME_FAHRPLAN"],
      longitude: parseFloat(row["X_WGS84"].replace(",", ".")),
      latitude: parseFloat(row["Y_WGS84"].replace(",", ".")),
      train_station: !!parseInt(row["IST_BAHNHOF"]),
    });
  }
  fs.writeFileSync(
    "assets/providers/rmv.json",
    JSON.stringify(relevantInfo, null, 2),
    "utf8"
  );
}

main()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
