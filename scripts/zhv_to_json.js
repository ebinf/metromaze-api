import fs from "fs";
import { XMLParser } from "fast-xml-parser";
import csv from "csvtojson";

const parser = new XMLParser();

function nameReplace(name) {
  if (name === "rms") return "RMV";
  return name;
}

function shortnameReplace(name) {
  if (name === "rms") return "rmv";
  if (name === "Hamburger Hochbahn") return "hha";
  return name.toLocaleLowerCase();
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error("No file specified");
  }

  const replacements_file = process.argv[3];
  if (!replacements_file) {
    console.log("No replacements file specified");
  }
  const replacements_data = parser.parse(
    fs.readFileSync(replacements_file, "utf8")
  );
  var replacements = {};
  if (replacements_data?.Items?.StopPlace) {
    var stopplaces = replacements_data?.Items?.StopPlace;
    if (!Array.isArray(replacements_data?.Items?.StopPlace)) {
      stopplaces = [replacements_data.Items.StopPlace];
    }
    for (const row of stopplaces) {
      replacements[row?.DHID] = row;
    }
  }

  const beacons_file = process.argv[4];
  if (!beacons_file) {
    console.log("No beacons file specified");
  }
  const beacons_data = await csv({
    delimiter: ",",
  }).fromFile(beacons_file);
  var beacons = {};
  for (const row of beacons_data) {
    if (beacons[row["HAFAS"]] === undefined) {
      beacons[row["HAFAS"]] = [];
    }
    beacons[row["HAFAS"]].push(row["Beacon"]);
  }

  const jsonData = parser.parse(fs.readFileSync(file, "utf8"));
  var relevantInfo = {};
  var metaInfo = {};
  for (var row of jsonData?.GetResponseType?.Items?.StopPlace) {
    if (row?.DHID in replacements) {
      row = replacements[row?.DHID];
      console.log(`Found replacement for ${row?.DHID} (${row?.Name?.Name})`);
    }
    if (row?.Condition?.ConditionKind === "Unserved") continue;
    if (row?.State?.StateKind === "OutOfOrder") continue;
    var locations = [];
    if (row?.AreaQuay?.Items?.Area) {
      var areas = row?.AreaQuay?.Items?.Area;
      if (!Array.isArray(areas)) {
        areas = [row?.AreaQuay?.Items?.Area];
      }
      for (const area of areas) {
        if (area?.Condition?.ConditionKind === "Unserved") continue;
        if (area?.State?.StateKind === "OutOfOrder") continue;
        if (!area?.Quays?.Quay) {
          locations.push(
            `${parseFloat(area?.Location?.Latitude)},${parseFloat(
              area?.Location?.Longitude
            )}`
          );
          continue;
        }
        var quays = area?.Quays?.Quay;
        if (!Array.isArray(quays)) {
          quays = [area?.Quays?.Quay];
        }
        for (const quay of quays) {
          if (quay?.Condition?.ConditionKind === "Unserved") continue;
          if (quay?.State?.StateKind === "OutOfOrder") continue;
          locations.push(
            `${parseFloat(quay?.Location?.Latitude)},${parseFloat(
              quay?.Location?.Longitude
            )}`
          );
        }
      }
    } else {
      locations.push(
        `${parseFloat(row?.Location?.Latitude)},${parseFloat(
          row?.Location?.Longitude
        )}`
      );
    }
    if (relevantInfo[row?.Authority?.Label] === undefined) {
      relevantInfo[row?.Authority?.Label] = [];
    }
    relevantInfo[row?.Authority?.Label].push({
      i: row?.DHID,
      n: row?.Name?.Name,
      l: locations,
      ...(row?.DHID in beacons ? { b: beacons[row?.DHID] } : {}),
    });
  }
  for (const key in relevantInfo) {
    fs.writeFileSync(
      `assets/providers/${shortnameReplace(key)}.json`,
      JSON.stringify(relevantInfo[key], null, 2),
      "utf8"
    );
    metaInfo[shortnameReplace(key)] = {
      name: nameReplace(key),
      stations: relevantInfo[key].length,
      updated: new Date(),
      size: fs.statSync(`assets/providers/${shortnameReplace(key)}.json`).size,
    };
  }
  fs.writeFileSync(
    `assets/providers/_providers.json`,
    JSON.stringify(metaInfo, null, 2),
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
