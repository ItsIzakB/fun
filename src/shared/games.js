export const games = [
  {
    id: "tetris",
    title: "Tetris",
    path: "/games/tetris",
    description: "Stack, spin, clear lines, and chase a higher level.",
    icon: "▣",
    accent: "#42f5b3",
    load: () => import("../games/tetris/index.js").then((module) => module.renderTetrisPage)
  },
  {
    id: "cavern-crafter",
    title: "Cavern Crafter",
    path: "/games/cavern-crafter",
    description: "Dig, build, and explore a pocket-sized underground world.",
    icon: "⬒",
    accent: "#ffcf4f",
    load: () => import("../games/cavern/index.js").then((module) => module.renderCavernPage)
  },
  {
    id: "darksouls",
    title: "The Ashen Warlock",
    path: "/games/darksouls",
    description: "A punishing 3D dungeon encounter. Patience and precision are your only weapons.",
    icon: "♜",
    accent: "#b74a35",
    load: () => import("../games/darksouls/index.js").then((module) => module.renderDarkSoulsPage)
  }
];

export function getGameByPath(pathname) {
  return games.find((game) => game.path === pathname);
}
