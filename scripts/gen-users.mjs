#!/usr/bin/env node
/**
 * gen-users.mjs — builds data/users.json (login accounts) from the Covert sales roster.
 *
 * Password for each rep = ANY of their Covert employee numbers (Ford store 04/01 or
 * Chevy store 03/01) — whichever they know works. Numbers are stored only as SHA-256
 * hashes, never plaintext. Re-run this to add/refresh accounts.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// [firstName, lastName, fordNum, chevyNum]  — from GMReview employees (role='sales')
const ROSTER = [
  ["Christian","Arceneaux","1613","4001613"],
  ["Jesus","Besonias","300867","867"],
  ["Garret","Boyd","1685","4001685"],
  ["Phillip","Brandon Lopez","319","400319"],
  ["Gessica","Brown","881","400881"],
  ["Mireya","B Sanchez","1021","4001021"],
  ["Cameron","Caldwell","1697","4001697"],
  ["Adrian","Campos Vega","1702","4001702"],
  ["Riley","Cantu","1642","4001642"],
  ["Tucker","Cargill","3001300","1300"],
  ["Isaac","Castaneda","3001351","1351"],
  ["Miguel","Castro Vargas","3001332","1332"],
  ["Rain","Chavez","3001256","1256"],
  ["Zenichi","Concelman","1626","4001626"],
  ["Christopher","Corey Huff","711","400711"],
  ["Bailey","Covert","3001249","1249"],
  ["Larry","Darnell Williams III","300860","860"],
  ["Jacob","Dwight Ward","716","400716"],
  ["Christopher","Elijah Smith","3001375","1375"],
  ["David","Enrique Ozornea","300842","842"],
  ["Jonathan","Evaristo Alcala","300840","840"],
  ["Luis","Garcia","1531","4001531"],
  ["Felician","Gobert Jr","1615","4001615"],
  ["Clay","Grant","3001357","1357"],
  ["Jordan","Harris","1563","4001563"],
  ["Christopher","Howe","300876","876"],
  ["Brenda","Howell","3001347","1347"],
  ["Devin","Huerta","3001368","1368"],
  ["Phillip","Ian Day","300877","877"],
  ["Elijah","Jackson","3001326","1326"],
  ["Anthony","Jemalle Favors","3001245","1245"],
  ["Felician","Joseph Gobert III","1025","4001025"],
  ["Patrick","Jude Fowler II","300497","497"],
  ["Addison","Klepper","1666","4001666"],
  ["Angel","Leal","300883","883"],
  ["Ricardo","Luis Ruiz Quinones","3001338","1338"],
  ["James","Maney","1672","4001672"],
  ["Jenna","Marie Gill","300844","844"],
  ["Craig","Martin Martinez","467","400467"],
  ["Ryan","Matthew Gill","760","400760"],
  ["Travis","M Etie","778","400778"],
  ["Micah","Morgan","1659","4001659"],
  ["Kwami","Na'Jae Wilborn","1501","4001501"],
  ["Brian","N Brown","300673","673"],
  ["Jared","Norton","3001345","1345"],
  ["Sarah","Oswalt","3001367","1367"],
  ["Aaron","Paterno",null,"4001664"],
  ["Todd","Patmon","3001376","1376"],
  ["Leslie","Payne","1658","4001658"],
  ["Sebastian","Soto","1649","4001649"],
  ["Charles","Tarrant","3001349","1349"],
  ["Ryan","Thomas Stathos","300839","839"],
  ["Michael","Williams","1554","4001554"],
  ["JR.","Woodman","1691","4001691"],
];

const users = ROSTER.map(([first, last, ford, chevy]) => {
  const name = `${first} ${last}`.replace(/\s+/g, " ").trim();
  const nums = [ford, chevy].filter(Boolean);
  return {
    slug: slugify(name),
    name,
    fordS1: ford || null,
    chevyS1: chevy || null,
    // accept either employee number as the password
    hashes: nums.map(sha),
    isAdmin: last === "Covert" && first === "Bailey",
  };
}).sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(path.join(DIR, "users.json"), JSON.stringify(users, null, 2) + "\n");
console.log(`✓ users.json — ${users.length} accounts (passwords = employee numbers, hashed)`);
