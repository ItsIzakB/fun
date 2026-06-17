import React, { useEffect, useRef } from "react";
import { BOSS_NAME, CONTROLS, WEAPONS } from "./config.js";
import { DarkSoulsGame } from "./darksouls.js";
import "./darksouls.css";

export function DarkSoulsPage() {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const playerHpRef = useRef(null);
  const staminaRef = useRef(null);
  const bossHpRef = useRef(null);
  const bossShieldRef = useRef(null);
  const messageRef = useRef(null);
  const endScreenRef = useRef(null);
  const endTitleRef = useRef(null);
  const endCopyRef = useRef(null);
  const retryRef = useRef(null);
  const homeRef = useRef(null);
  const weaponScreenRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const game = new DarkSoulsGame({
      stage,
      canvas: canvasRef.current,
      hpBar: playerHpRef.current,
      staminaBar: staminaRef.current,
      bossHpBar: bossHpRef.current,
      bossShieldBar: bossShieldRef.current,
      messageEl: messageRef.current,
      endScreen: endScreenRef.current,
      endTitle: endTitleRef.current,
      endCopy: endCopyRef.current,
      retryButton: retryRef.current,
      homeLink: homeRef.current,
      weaponScreen: weaponScreenRef.current,
      weaponButtons: stage.querySelectorAll("[data-weapon]")
    });

    game.start();
    return () => game.destroy();
  }, []);

  return (
    <section className="souls-page">
      <div className="game-title souls-title">
        <p className="eyebrow">Third trial</p>
        <h1>{BOSS_NAME}</h1>
        <p>A dark fantasy duel in cursed ruins. Read the wind-up, spend stamina carefully, and survive.</p>
      </div>

      <section className="souls-stage" data-souls-stage ref={stageRef}>
        <canvas className="souls-canvas" data-souls-canvas aria-label={`${BOSS_NAME} game canvas`} ref={canvasRef} />

        <div className="souls-hud" aria-hidden="false">
          <div className="boss-hud">
            <span>{BOSS_NAME}</span>
            <div className="souls-bar souls-bar--boss">
              <i data-boss-hp ref={bossHpRef} />
              <b data-boss-shield ref={bossShieldRef} />
            </div>
          </div>

          <div className="player-hud">
            <div className="souls-bar souls-bar--hp"><i data-player-hp ref={playerHpRef} /></div>
            <div className="souls-bar souls-bar--stamina"><i data-player-stamina ref={staminaRef} /></div>
          </div>

          <aside className="souls-controls" aria-label="Controls">
            <h2>Controls</h2>
            <dl>
              {CONTROLS.map(([key, label]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </aside>

          <div className="souls-message" data-souls-message ref={messageRef}>
            Hold right mouse to block. Time it just before impact to parry.
          </div>
        </div>

        <div className="souls-end-screen" data-souls-end hidden ref={endScreenRef}>
          <div>
            <strong data-souls-end-title ref={endTitleRef}>YOU DIED</strong>
            <p data-souls-end-copy ref={endCopyRef}>The dungeon keeps what panic gives it.</p>
            <button className="button-link button-link--button" type="button" data-souls-retry ref={retryRef}>Try Again</button>
            <a className="button-link" href="/" data-link data-souls-home hidden ref={homeRef}>Return to Home</a>
          </div>
        </div>

        <div className="souls-weapon-screen" data-souls-weapon ref={weaponScreenRef}>
          <div>
            <p className="eyebrow">Choose your weapon</p>
            <h2>Steel decides your rhythm.</h2>
            <div className="weapon-choice-grid">
              {Object.entries(WEAPONS).map(([id, weapon]) => (
                <button className="weapon-choice" type="button" data-weapon={id} key={id}>
                  <strong>{weapon.label}</strong>
                  <span>{weapon.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
