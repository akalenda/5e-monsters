(function () {
	"use strict";

	angular.module("app")
		.factory("encounter", EncounterService);

	EncounterService.$inject = ['$rootScope', 'randomEncounter', 'store', 'metaInfo', 'monsters', 'players', 'misc'];

	function EncounterService($rootScope, randomEncounter, store, metaInfo, monsters, players, miscLib) {
		var encounter = {
				getMultiplier: miscLib.getMultiplier,
				groups: {},
				partyLevel: metaInfo.levels[0],
				playerCount: 4,
				reference: null,
				threat: {},
				add: function (monster, qty) {
					if ( typeof qty === "undefined" ) {
						qty = 1;
					}

					encounter.groups[monster.id] = encounter.groups[monster.id] || {
						qty: 0,
						monster: monster,
					};

					encounter.groups[monster.id].qty += qty;
					encounter.qty += qty;
					encounter.exp += monster.cr.exp * qty;

					encounter.reference = null;
				},
				generateRandom: function (filters, targetDifficulty) {
					targetDifficulty = targetDifficulty || 'medium';
					var targetExp = encounter.partyLevel[targetDifficulty];
					var monsters = randomEncounter.getRandomEncounter(encounter.playerCount, targetExp, filters),
						i;

					encounter.reset();

					for ( i = 0; i < monsters.length; i++ ) {
						encounter.add( monsters[i].monster, monsters[i].qty );
					}
				},
				randomize: function (monster, filters) {
					var monsterList = randomEncounter.getShuffledMonsterList(monster.cr.string),
						qty = encounter.groups[monster.id].qty;

					while ( monsterList.length ) {
						// Make sure we don't roll a monster we already have
						if ( encounter.groups[monsterList[0].name] ) {
							monsterList.shift();
							continue;
						}

						if ( monsters.check( monsterList[0], filters, { skipCrCheck: true } ) ) {
							encounter.remove(monster, true);
							encounter.add( monsterList[0], qty );
							return;					
						} else {
							monsterList.shift();
						}
					}
				},
				recalculateThreatLevels: function () {
					var count = encounter.playerCount,
						level = encounter.partyLevel,
						mediumExp = count * level.medium,
						singleMultiplier  = 1,
						pairMultiplier    = 1.5,
						groupMultiplier   = 2,
						trivialMultiplier = 2.5;

					if ( count < 3 ) {
						// For small groups, increase multiplier
						singleMultiplier  = 1.5;
						pairMultiplier    = 2;
						groupMultiplier   = 2.5;
						trivialMultiplier = 3;
					} else if ( count > 5 ) {
						// For large groups, reduce multiplier
						singleMultiplier  = 0.5;
						pairMultiplier    = 1;
						groupMultiplier   = 1.5;
						trivialMultiplier = 2;
					}

					encounter.threat.deadly  = count * level.deadly / singleMultiplier;
					encounter.threat.hard    = count * level.hard / singleMultiplier;
					encounter.threat.medium  = mediumExp / singleMultiplier;
					encounter.threat.easy    = count * level.easy / singleMultiplier;
					encounter.threat.pair    = mediumExp / ( 2 * pairMultiplier );
					encounter.threat.group   = mediumExp / ( 4 * groupMultiplier );
					encounter.threat.trivial = mediumExp / ( 8 * trivialMultiplier );

					if ( $rootScope.$$phase !== "$digest" ) {
						// This function gets called when encounter builder is being set up, before 
						// the saved values from the cloud are returned. All other updates seem to
						// happen during the $apply phase, so hopefully this should be safe...
						freeze();
					}
				},
				remove: function (monster, removeAll) {
					encounter.groups[monster.id].qty--;
					encounter.qty--;
					encounter.exp -= monster.cr.exp;
					if ( encounter.groups[monster.id].qty === 0 ) {
						delete encounter.groups[monster.id];
					} else if ( removeAll ) {
						// Removing all is implemented by recurively calling this function until the
						// qty is 0
						encounter.remove(monster, true);
					}

					encounter.reference = null;
				},
				reset: function (storedEncounter) {
					encounter.reference = null;
					encounter.qty = 0;
					encounter.exp = 0;
					encounter.groups = {};
					encounter.threat = {};

					if (storedEncounter) {
						Object.keys(storedEncounter.groups).forEach(function (id) {
							encounter.add(
								monsters.byId[id],
								storedEncounter.groups[id],
								{ skipFreeze: true }
							);
						});

						encounter.reference = storedEncounter;
					}

					encounter.recalculateThreatLevels();
				},
		};

		Object.defineProperty(encounter, "adjustedExp", {
			get: function () {
				var qty = encounter.qty,
					exp = encounter.exp,
					multiplier = encounter.getMultiplier(encounter.playerCount, qty);

				return Math.floor(exp * multiplier);
			},
		});

		Object.defineProperty(encounter, "difficulty", {
			get: function () {
				var exp = encounter.adjustedExp,
					count = encounter.playerCount,
					level = encounter.partyLevel;

				if ( exp === 0 ) {
					return false;
				}

				if ( exp < ( count * level.easy ) ) {
					return '';
				} else if ( exp < ( count * level.medium ) ) {
					return "Easy";
				} else if ( exp < ( count * level.hard ) ) {
					return "Medium";
				} else if ( exp < ( count * level.deadly ) ) {
					return "Hard";
				} else {
					return "Deadly";
				}
			},
		});

		thaw();
		encounter.recalculateThreatLevels();

		function freeze() {
			var o = {
				groups: {},
				partyLevel: encounter.partyLevel.level,
				playerCount: encounter.playerCount,
			};

			Object.keys(encounter.groups).forEach(function (monsterId) {
				o.groups[monsterId] = encounter.groups[monsterId].qty;
			});

			store.set("5em-encounter", o);
		}

		function thaw() {
			encounter.reset();

			store.get("5em-encounter").then(function (frozen) {
				if ( !frozen ) {
					return;
				}

				encounter.partyLevel = miscLib.levels[frozen.partyLevel - 1]; // level 1 is index 0, etc
				encounter.playerCount = frozen.playerCount;
			});
		}

		return encounter;
	}
})();