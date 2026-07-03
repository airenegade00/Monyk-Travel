// functions/index.js
// Telepítés: firebase deploy --only functions
// Előtte: firebase init functions (ha még nincs functions mappa a projektben),
// majd ezt a fájlt másold a functions/index.js helyére, és futtasd:
//   cd functions && npm install firebase-admin firebase-functions

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Ennyi perccel indulás előtt küldünk emlékeztetőt (ha van rá token)
const REMINDER_OFFSETS_MIN = [180, 60];

async function tokensForTrip(tripCode) {
  const snap = await db.collection('trips').doc(tripCode).collection('pushTokens').get();
    return snap.docs.map(d => d.data());
    }

    async function sendToTokens(tokenDocs, title, body, excludeMemberName) {
      const targets = tokenDocs.filter(t => !excludeMemberName || t.memberName !== excludeMemberName);
        if (!targets.length) return;
          const tokens = targets.map(t => t.token);
            try {
                await messaging.sendEachForMulticast({
                      tokens,
                            notification: { title, body }
                                });
                                  } catch (e) {
                                      console.warn('push send failed', e);
                                        }
                                        }

                                        // ── 1) Repülő/vonat indulási emlékeztetők ──
                                        // 15 percenként lefut, megnézi az összes megosztott utazás flightStatus.dt
                                        // mezőjét, és a REMINDER_OFFSETS_MIN időpontokban küld push-t, majd
                                        // megjelöli, hogy az adott ablakra már küldött, hogy ne ismételje.
                                        exports.flightReminders = onSchedule('every 15 minutes', async (event) => {
                                          const now = Date.now();
                                            const tripsSnap = await db.collection('trips').get();

                                              for (const tripDoc of tripsSnap.docs) {
                                                  const trip = tripDoc.data();
                                                      const fs = trip.flightStatus;
                                                          if (!fs || !fs.dt) continue;

                                                              const target = new Date(fs.dt).getTime();
                                                                  if (isNaN(target)) continue;
                                                                      const diffMin = Math.round((target - now) / 60000);
                                                                          const notified = fs.notified || {};

                                                                              for (const offset of REMINDER_OFFSETS_MIN) {
                                                                                    const key = 't' + offset;
                                                                                          // ha a visszaszámláló ~offset percre van (15 perces ablakon belül) és még nem küldtünk erre
                                                                                                if (diffMin <= offset && diffMin > offset - 15 && !notified[key]) {
                                                                                                        const ico = fs.type === 'train' ? '🚆' : '✈️';
                                                                                                                const label = offset >= 60 ? `${Math.round(offset / 60)} óra` : `${offset} perc`;
                                                                                                                        const title = `${ico} Indulás ${label} múlva`;
                                                                                                                                const body = `${fs.code || ''} ${fs.from ? fs.from + ' → ' + fs.to : ''}${fs.gate ? ' • Kapu/vágány: ' + fs.gate : ''}`.trim();

                                                                                                                                        const tokens = await tokensForTrip(tripDoc.id);
                                                                                                                                                await sendToTokens(tokens, title, body);

                                                                                                                                                        notified[key] = true;
                                                                                                                                                                await tripDoc.ref.set({ flightStatus: { ...fs, notified } }, { merge: true });
                                                                                                                                                                      }
                                                                                                                                                                          }
                                                                                                                                                                            }
                                                                                                                                                                            });

                                                                                                                                                                            // ── 2) "Kérek friss pozíciót" push ──
                                                                                                                                                                            // Amikor egy trip dokumentumban változik a liveShare.requestedAt mező
                                                                                                                                                                            // (ezt az index.html etoRequestLocation() függvénye írja), push-t küldünk
                                                                                                                                                                            // mindenkinek, aki nem a kérő maga.
                                                                                                                                                                            exports.liveShareRequest = onDocumentUpdated('trips/{tripCode}', async (event) => {
                                                                                                                                                                              const before = event.data.before.data() || {};
                                                                                                                                                                                const after = event.data.after.data() || {};
                                                                                                                                                                                  const beforeReq = (before.liveShare && before.liveShare.requestedAt) || 0;
                                                                                                                                                                                    const afterReq = (after.liveShare && after.liveShare.requestedAt) || 0;

                                                                                                                                                                                      if (afterReq > beforeReq) {
                                                                                                                                                                                          const requester = (after.liveShare && after.liveShare.requestedBy) || 'Valaki';
                                                                                                                                                                                              const tokens = await tokensForTrip(event.params.tripCode);
                                                                                                                                                                                                  await sendToTokens(
                                                                                                                                                                                                        tokens,
                                                                                                                                                                                                              '📍 Helyzet frissítést kérnek',
                                                                                                                                                                                                                    `${requester} szeretné tudni, hol vagy most`,
                                                                                                                                                                                                                          requester
                                                                                                                                                                                                                              );
                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                });

                                                                                                                                                                                                                                // ── 3) Csoportos chat: push új üzenetnél ──
                                                                                                                                                                                                                                // Amikor egy trip alá egy új chat-dokumentum kerül (ezt az index.html
                                                                                                                                                                                                                                // sendChatMessage() függvénye írja), push-t küldünk mindenkinek, aki nem
                                                                                                                                                                                                                                // a küldő maga. Az app nyitva léte esetén ezt az onSnapshot listener és a
                                                                                                                                                                                                                                // toast() intézi a kliens oldalon, ez a function csak a háttérben/zárt
                                                                                                                                                                                                                                // állapotban lévő eszközökhöz szükséges.
                                                                                                                                                                                                                                exports.chatMessageNotify = onDocumentCreated('trips/{tripCode}/chat/{msgId}', async (event) => {
                                                                                                                                                                                                                                  const msg = event.data.data();
                                                                                                                                                                                                                                    if (!msg) return;
                                                                                                                                                                                                                                      const sender = msg.sender || 'Valaki';
                                                                                                                                                                                                                                        const text = (msg.text || '').slice(0, 120);

                                                                                                                                                                                                                                          const tokens = await tokensForTrip(event.params.tripCode);
                                                                                                                                                                                                                                            await sendToTokens(
                                                                                                                                                                                                                                                tokens,
                                                                                                                                                                                                                                                    `💬 ${sender}`,
                                                                                                                                                                                                                                                        text,
                                                                                                                                                                                                                                                            sender
                                                                                                                                                                                                                                                              );
                                                                                                                                                                                                                                                              });

                                                                                                                                                                                                                                                              // ── 4) Új tag csatlakozott az utazáshoz ──
                                                                                                                                                                                                                                                              // Amikor egy trip dokumentum tagok mezője bővül egy új taggal (ezt az
                                                                                                                                                                                                                                                              // index.html joinTripByCode() függvénye írja a tagok tömbbe – ugyanazt
                                                                                                                                                                                                                                                              // a diffelést végezzük itt, mint a kliens saját attachTripListeners()
                                                                                                                                                                                                                                                              // figyelője), push-t küldünk mindenkinek, aki nem az újonnan csatlakozó
                                                                                                                                                                                                                                                              // maga. Az app nyitva léte esetén ezt a meta onSnapshot listener és a
                                                                                                                                                                                                                                                              // toast() intézi a kliens oldalon, ez a function csak a háttérben/zárt
                                                                                                                                                                                                                                                              // állapotban lévő eszközökhöz szükséges.
                                                                                                                                                                                                                                                              exports.memberJoinedNotify = onDocumentUpdated('trips/{tripCode}', async (event) => {
                                                                                                                                                                                                                                                                const before = event.data.before.data() || {};
                                                                                                                                                                                                                                                                  const after = event.data.after.data() || {};
                                                                                                                                                                                                                                                                    const beforeIds = (before.tagok || []).map(t => t.id);
                                                                                                                                                                                                                                                                      const joined = (after.tagok || []).filter(t => !beforeIds.includes(t.id));
                                                                                                                                                                                                                                                                        if (!joined.length) return;

                                                                                                                                                                                                                                                                          const tripName = after.nev ? ` – ${after.nev}` : '';
                                                                                                                                                                                                                                                                            const tokens = await tokensForTrip(event.params.tripCode);
                                                                                                                                                                                                                                                                              for (const member of joined) {
                                                                                                                                                                                                                                                                                  const name = member.nev || 'Valaki';
                                                                                                                                                                                                                                                                                      await sendToTokens(
                                                                                                                                                                                                                                                                                            tokens,
                                                                                                                                                                                                                                                                                                  '👋 Új útitárs csatlakozott',
                                                                                                                                                                                                                                                                                                        `${name} csatlakozott az utazáshoz${tripName}`,
                                                                                                                                                                                                                                                                                                              name
                                                                                                                                                                                                                                                                                                                  );
                                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                                    });
                                                                                                                                                                                                                                                                                                                    