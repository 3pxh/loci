# General Loci Game Specs

## Interaction
Interaction should be mobile friendly. This means that interactions should be done generically (click and touch should be equivalent, drag and mousemove, etc.). If you are reading this for the first time and choose a good library to do it, then also modify this file to describe how it has been solved.

## Viewport
Should also be mobile friendly and desktop friendly. That means that assumptions about aspect ratio given the puzzles might want to allow levels which have absolute coordinates to encode a level that can be rotated, plus checking for rotation of the screen.

## Game Creation Process
These games are under development as bite-size experiences which should be tight and provide an arc which gives a novel relationship to space. We're not interested in infinite runners or mindless puzzles, but introducing a mechanic and having the player interact with spatial relationships in a new way, even if the experience only lasts five or ten minutes. Accordingly, the development process is going to be quite exploratory. As a coding agent, this means a couple things:
1. You will present your work for human review, with a range of options governing the characteristic of the game (which a human can tune) and configurable level progression options. You will receive feedback.
2. You are encouraged to show alternative versions of an experience, provided you also implement the basic functionality as prompted in a given game specification. You should include an exploration process as well as submit new game ideas to `docs/Ideas.md` as you encounter things not covered.