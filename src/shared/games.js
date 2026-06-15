import { renderTetrisPage } from "../games/tetris/index.js";

export const games = [
  {
    id: "tetris",
    title: "Tetris",
    path: "/games/tetris",
    description: "Stack, spin, clear lines, and chase a higher level.",
    icon: "▣",
    accent: "#42f5b3",
    render: renderTetrisPage
  }
];

export function getGameByPath(pathname) {
  return games.find((game) => game.path === pathname);
}
