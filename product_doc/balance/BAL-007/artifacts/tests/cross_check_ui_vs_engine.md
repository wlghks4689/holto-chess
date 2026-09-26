engine runCards.p1: [ [ 'As', 'Ah' ], [ 'As', 'Kd' ] ]
engine runCards.p2: [ [ '7c', '7d' ], [ '7c', '9h' ] ]

UI runIds construction matches engine's actual RUN split: true

RUN1 equity WITH correct 6-card dead-card exclusion: [ 80, 20 ]
RUN1 equity WITH NO dead-card exclusion (wrong — leaves the other 2 secondaries in the deck): [ 79, 21 ]
Difference exists (dead-card exclusion changes the result): true
