[PASS] hole-triple-eight + board-eight trap (must stay TRIPS, not QUADS)
  holes=8s,8h,8d,Kc board=8c,2h,9d
  findBestOmaha => TRIPS (expected TRIPS)
  naive best-5-of-7 (WRONG rule, for contrast) => QUADS
  홀 3장(8s8h8d)+보드 1장(8c) 합쳐 8이 네 장 있어도, Omaha는 홀 2장만 쓸 수 있어 포카드가 아니라 트립스여야 한다.
[PASS] trips-in-hole trap (3 hole kings, only 2 usable)
  holes=Ks,Kh,Kd,2c board=3d,5h,9s
  findBestOmaha => PAIR (expected PAIR)
  naive best-5-of-7 (WRONG rule, for contrast) => TRIPS
  홀카드에 K가 3장 있어도 2장만 쓸 수 있어 트립스가 아니라 페어(K 페어)에 그쳐야 한다.
[PASS] board-only-flush trap (zero hole spades)
  holes=2c,5d,9h,Qc board=As,Ks,Ts,6s,4s
  findBestOmaha => HIGH_CARD (expected HIGH_CARD)
  naive best-5-of-7 (WRONG rule, for contrast) => FLUSH
  보드에 스페이드가 4~5장 떠 있어도 홀카드에 스페이드가 0장이면 어떤 2+3 조합도 스페이드 5장을 만들 수 없다.
[PASS] one-hole-flush-card is not enough (only 1 hole spade)
  holes=2s,5d,9h,Qc board=As,Ks,Ts,6s,4s
  findBestOmaha => HIGH_CARD (expected HIGH_CARD)
  naive best-5-of-7 (WRONG rule, for contrast) => FLUSH
  홀카드에 스페이드가 1장뿐이면 어떤 조합도 스페이드 5장(홀 2장 모두 필요)을 만들 수 없다.
[PASS] positive control: exactly 2 hole spades DOES complete a legal flush
  holes=2s,5s,9h,Qc board=As,Ks,Ts,6s,4c
  findBestOmaha => FLUSH (expected FLUSH)
  naive best-5-of-7 (WRONG rule, for contrast) => FLUSH
  홀에 스페이드가 정확히 2장(2s,5s)이면 보드 스페이드 3장과 합쳐 합법적인 5-플러시가 된다 — 제약이 있어도 정상적인 플러시는 인정되어야 한다.

5/5 Omaha constraint checks passed.
