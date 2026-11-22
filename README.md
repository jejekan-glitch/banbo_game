# 달빛 정원 (banbo_game)

AI한테 말로 부탁해서 만든 픽셀 3D 디오라마 세 개(마법사의 룬 제단 · 달빛 유적 · 숲의 골렘)를 한 땅에 합친 작은 웹게임이에요.
설치 없이 브라우저에서 바로 돌아가요.

- ▶ 플레이: https://jejekan-glitch.github.io/banbo_game/
- 만든 과정 영상(반보AI): https://youtu.be/9AXHIswQgi0

## 조작

| 하는 일 | PC | 휴대폰 |
|---|---|---|
| 걷기 | W A S D · 방향키 | 바닥 누르기 |
| 둘러보기 | 화면 드래그 | 화면 드래그 |
| 확대·축소 | 마우스 휠 | 두 손가락 모으기 |
| 월광 나선(가까운 골렘 자동 조준) | Space | `월광 나선` 버튼 |
| 낙성(골렘 위로 불타는 운석) | R | `낙성` 버튼 |
| 점멸(이동 방향으로 순간이동) | Shift | `점멸` 버튼 |

골렘이 팔을 들고 땅이 호박색으로 물들면, 바위가 솟기 전에 범위 밖으로 나가세요.
화면이 느리면 주소 끝에 `?render=lite`를 붙여 가벼운 모드로 열 수 있어요. 소리는 오른쪽 위 `소리 켜기`로 켜고 꺼요.

## 어떻게 만들었나

- 장면: 오픈소스 [ink-studio](https://github.com/siliconjungle/shapeshift-labs-ink-studio)(MIT)로 만든 디오라마 세 개. 장면 코드는 Codex의 `gpt-6.2-astra`가 썼어요.
- 게임: 같은 모델에게 말로 부탁해서 걷기 → 전투 → 화질 → 소리 → 맵 넓히기 순서로 붙였어요. 과정은 위 영상에 있어요.
- 그림 파일·음원 파일은 없어요. 점 데이터(`garden-data.js`)와 코드로 그리고, 소리도 브라우저에서 합성해요.

## 파일

| 파일 | 내용 |
|---|---|
| `index.html`, `garden.css` | 화면과 조작 버튼 |
| `game.js` | 걷기·카메라·전투 |
| `renderer.js`, `lite.js` | 고화질 3D(WebGL) / 가벼운 모드 그리기 |
| `impact-art.js` | 운석 자국·땅 파괴 효과 |
| `sound.js` | 배경음·효과음 합성 |
| `garden-data.js` | ink-studio 장면에서 구운 정원 점 데이터 |
| `INK-STUDIO-LICENSE.txt` | ink-studio 라이선스 고지(MIT) |

## 출처

- ink-studio — siliconjungle/shapeshift-labs-ink-studio, MIT License (`INK-STUDIO-LICENSE.txt`)
- 땅 파괴 효과는 작업 중 AI가 참고한 공개 자료를 보고 코드로 새로 만든 것이에요:
  [Floor Smash VFX](https://rohad.artstation.com/projects/rly3Z2) · [Pixel Art Ground Slam Shockwave](https://particlefx.studio/effects/pixel-art-ground-slam-shockwave)
