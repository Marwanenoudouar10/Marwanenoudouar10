// Builds the two profile cards (stats + languages) as SVG files.
// Usage: GITHUB_TOKEN=$(gh auth token) node scripts/cards.mjs assets
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USER = "Marwanenoudouar10";
// The profile repo itself is left out of the language mix.
const SKIP = new Set(["Marwanenoudouar10"]);
const OUT = process.argv[2] ?? "out";

const theme = {
  bg: "#1a1b27",
  title: "#70a5fd",
  text: "#38bdae",
  muted: "#a9b1d6",
  icon: "#bf91f3",
};

const query = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      totalCount
      nodes {
        name
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions }
    }
  }
}`;

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is not set");

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-cards" },
  body: JSON.stringify({ query, variables: { login: USER } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
const user = json.data.user;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");
const font = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif"`;

// Stats card
const repos = user.repositories.nodes;
const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);
const c = user.contributionsCollection;
const rows = [
  ["Contributions in the last year", c.contributionCalendar.totalContributions],
  ["Private contributions (last year)", c.restrictedContributionsCount],
  ["Public repositories", user.repositories.totalCount],
  ["Stars earned", stars],
  ["Followers", user.followers.totalCount],
];
const statsW = 467;
const statsH = 170;
const statRows = rows
  .map(
    ([label, value], i) => `
  <g transform="translate(25, ${62 + i * 22})">
    <circle cx="5" cy="-4" r="4" fill="${theme.icon}" />
    <text x="20" y="0" ${font} font-size="14" font-weight="600" fill="${theme.text}">${esc(label)}:</text>
    <text x="300" y="0" ${font} font-size="14" font-weight="700" fill="${theme.text}">${fmt(value)}</text>
  </g>`,
  )
  .join("");
const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${statsW}" height="${statsH}" viewBox="0 0 ${statsW} ${statsH}" role="img" aria-label="GitHub stats for Marwane Boudouar">
  <rect width="${statsW}" height="${statsH}" rx="6" fill="${theme.bg}" />
  <text x="25" y="35" ${font} font-size="18" font-weight="600" fill="${theme.title}">Marwane Boudouar's GitHub Stats</text>${statRows}
</svg>
`;

// Languages card
const totals = new Map();
for (const repo of repos) {
  if (SKIP.has(repo.name)) continue;
  for (const { size, node } of repo.languages.edges) {
    const prev = totals.get(node.name) ?? { size: 0, color: node.color ?? theme.muted };
    prev.size += size;
    totals.set(node.name, prev);
  }
}
const sum = [...totals.values()].reduce((a, b) => a + b.size, 0) || 1;
const langs = [...totals.entries()]
  .map(([name, v]) => ({ name, color: v.color, pct: (v.size / sum) * 100 }))
  .sort((a, b) => b.pct - a.pct)
  .slice(0, 8);
const shown = langs.reduce((a, l) => a + l.pct, 0) || 1;
const langW = 300;
const barW = langW - 50;
let x = 25;
const bar = langs
  .map((l) => {
    const w = (l.pct / shown) * barW;
    const seg = `<rect x="${x.toFixed(2)}" y="52" width="${w.toFixed(2)}" height="8" fill="${l.color}" />`;
    x += w;
    return seg;
  })
  .join("");
const perCol = Math.ceil(langs.length / 2);
const items = langs
  .map((l, i) => {
    const col = i < perCol ? 0 : 1;
    const row = i % perCol;
    return `
  <g transform="translate(${25 + col * 135}, ${88 + row * 22})">
    <circle cx="5" cy="-4" r="5" fill="${l.color}" />
    <text x="16" y="0" ${font} font-size="11" font-weight="400" fill="${theme.text}">${esc(l.name)} ${l.pct.toFixed(2)}%</text>
  </g>`;
  })
  .join("");
const langH = 88 + perCol * 22 + 6;
const langSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${langW}" height="${langH}" viewBox="0 0 ${langW} ${langH}" role="img" aria-label="Most used languages">
  <rect width="${langW}" height="${langH}" rx="6" fill="${theme.bg}" />
  <text x="25" y="35" ${font} font-size="18" font-weight="600" fill="${theme.title}">Most Used Languages</text>
  <clipPath id="bar"><rect x="25" y="52" width="${barW}" height="8" rx="4" /></clipPath>
  <g clip-path="url(#bar)">${bar}</g>${items}
</svg>
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "stats.svg"), statsSvg);
writeFileSync(join(OUT, "languages.svg"), langSvg);
console.log(`wrote ${OUT}/stats.svg and ${OUT}/languages.svg (${langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")})`);
