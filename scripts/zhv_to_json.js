import fs from "fs";
import { XMLParser } from "fast-xml-parser";

async function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error("No file specified");
  }
  const parser = new XMLParser();
  const jsonData = parser.parse(fs.readFileSync(file, "utf8"));
  var relevantInfo = [];
  for (const row of jsonData?.GetResponseType?.Items?.StopPlace) {
    if (!row?.DHID.startsWith("de:06411:")) continue;
    var locations = [];
    if (row?.AreaQuay?.Items?.Area) {
      var areas = row?.AreaQuay?.Items?.Area;
      if (!Array.isArray(areas)) {
        areas = [row?.AreaQuay?.Items?.Area];
      }
      for (const area of areas) {
        if (!area?.Quays?.Quay) {
          locations.push({
            name: "area | " + area?.Name?.Name,
            latitude: parseFloat(area?.Location?.Latitude),
            longitude: parseFloat(area?.Location?.Longitude),
          });
          continue;
        }
        var quays = area?.Quays?.Quay;
        if (!Array.isArray(quays)) {
          quays = [area?.Quays?.Quay];
        }
        for (const quay of quays) {
          locations.push({
            name: "quay | " + quay?.Name?.Name,
            latitude: parseFloat(quay?.Location?.Latitude),
            longitude: parseFloat(quay?.Location?.Longitude),
          });
        }
      }
    } else {
      locations = [
        {
          name: "stop | " + row?.Name?.Name,
          latitude: parseFloat(row?.Location?.Latitude),
          longitude: parseFloat(row?.Location?.Longitude),
        },
      ];
    }
    var beacons = [];
    relevantInfo.push({
      id: row?.DHID,
      name: row?.Name?.Name,
      locations: locations,
      beacons: beacons,
    });
  }
  fs.writeFileSync(
    "assets/providers/zhv.json",
    JSON.stringify(relevantInfo, null, 2),
    // JSON.stringify(jsonData, null, 2),
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
