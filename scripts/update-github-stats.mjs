
import fs from "node:fs";
import path from "node:path";

const username = process.env.GH_USERNAME || "chittivalasa124";
const token = process.env.GH_TOKEN;

if (!token) {
  throw new Error("Missing GH_TOKEN. Configure GH_STATS_TOKEN.");
}

const query = `
  query($login: String!) {
    user(login: $login) {
      name
      repositories(
        first: 100
        ownerAffiliations: OWNER
        privacy: PUBLIC
      ) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          stargazerCount
        }
      }
      contributionsCollection {
        totalCommitContributions
        contributionCalendar {
          totalContributions
        }
      }
      pullRequests {
        totalCount
      }
      issues {
        totalCount
      }
    }
  }
`;

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-profile-stats"
    },
    body: JSON.stringify({ query, variables })
  });

  const result = await response.json();

  if (!response.ok || result.errors) {
    throw new Error(JSON.stringify(result.errors || result));
  }

  return result.data;
}

const data = await graphql(query, { login: username });

if (!data.user) {
  throw new Error(`GitHub user not found: ${username}`);
}

const user = data.user;
const contributions = user.contributionsCollection;

let stars = user.repositories.nodes.reduce(
  (sum, repo) => sum + repo.stargazerCount,
  0
);

let pageInfo = user.repositories.pageInfo;

while (pageInfo.hasNextPage) {
  const nextQuery = `
    query($login: String!, $cursor: String!) {
      user(login: $login) {
        repositories(
          first: 100
          after: $cursor
          ownerAffiliations: OWNER
          privacy: PUBLIC
        ) {
          nodes {
            stargazerCount
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const next = await graphql(nextQuery, {
    login: username,
    cursor: pageInfo.endCursor
  });

  const repos = next.user.repositories;

  stars += repos.nodes.reduce(
    (sum, repo) => sum + repo.stargazerCount,
    0
  );

  pageInfo = repos.pageInfo;
}

const stats = {
  stars,
  commits: contributions.totalCommitContributions,
  contributions: contributions.contributionCalendar.totalContributions,
  prs: user.pullRequests.totalCount,
  issues: user.issues.totalCount
};

console.log("GitHub statistics:", stats);

const rows = [
  ["Total Stars Earned:", stats.stars],
  ["Commits (last year):", stats.commits],
  ["Contributions (last year):", stats.contributions],
  ["Total PRs Created:", stats.prs],
  ["Total Issues Created:", stats.issues]
];

const rowSvg = rows.map(([label, value], index) => {
  const y = 65 + index * 24;

  return `
    <text x="24" y="${y}">${label}</text>
    <text x="235" y="${y}">${value}</text>
  `;
}).join("\n");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="450"
     height="190"
     viewBox="0 0 450 190"
     role="img"
     aria-label="Chittivalasa Rakesh GitHub Statistics">

  <rect x="0.5" y="0.5"
        width="449" height="189"
        rx="5"
        fill="#ffffff"
        stroke="#e4e2e2"/>

  <text x="24" y="30"
        font-family="Arial, sans-serif"
        font-size="17"
        font-weight="600"
        fill="#0969da">
    Chittivalasa Rakesh's GitHub Stats
  </text>

  <g font-family="Arial, sans-serif"
     font-size="12.5"
     font-weight="600"
     fill="#434d58">
    ${rowSvg}
  </g>

  <circle cx="365" cy="105" r="39"
          fill="none"
          stroke="#d5e5fa"
          stroke-width="6"/>

  <circle cx="365" cy="105" r="39"
          fill="none"
          stroke="#5395f5"
          stroke-width="6"
          stroke-dasharray="42 245"
          stroke-linecap="round"
          transform="rotate(-90 365 105)"/>

  <text x="365" y="113"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="25"
        font-weight="bold"
        fill="#434d58">
    RC
  </text>

</svg>
`.trim() + "\n";

const output = path.join("assets", "github-stats.svg");

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg, "utf8");

console.log(`Updated ${output}`);
