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
    id: "darksouls",
    title: "The Ashen Warlock",
    path: "/games/ashen-warlock",
    description: "A punishing 3D dungeon encounter. Patience and precision are your only weapons.",
    icon: "♜",
    accent: "#b74a35",
    load: () => import("../games/darksouls/index.js").then((module) => module.renderDarkSoulsPage)
  }
];

export function getGameByPath(pathname) {
  return games.find((game) => game.path === pathname);
}
