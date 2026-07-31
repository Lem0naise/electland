---
layout: post
title: "Building Electland: a smaller political playground"
date: 2026-07-31 16:32:00 +0100
author: Indigo Nolan
permalink: /electland
tags:
    - coding
---

> **TLDR:** I made a political simulator again, but this time I shrank the country down to one slightly chaotic local council. It is called **Electland**: a game about winning a ward, annoying the party whip, making enemies in committee, and trying to get a pothole scheme through a hung council.

---

Earlier this year, I wrote about [The Political Playground](): a very broad political sandbox where you can make parties, define countries, move them around a seven-axis ideological space, campaign through an election and eventually try to form a government.

I still like it! There is something very satisfying about setting up a country full of invented voter blocs and seeing a party you have accidentally made too environmentally industrialist collapse in the polls.

But while working on it, I kept finding myself most interested in the *small* parts of politics. Not “who forms the national government?” so much as:

* Why does this one councillor hate me?
* Can I win this ward if I spend four weeks knocking on doors?
* What happens if I vote against my own party on a popular local issue?
* Is it worth upsetting everybody to get a community centre funded?

That is where **Electland** came from.

## Same idea, much smaller map

The Political Playground is built around national politics. You choose or construct parties, define a whole electorate, and watch broad ideological currents move across a country. The player is effectively steering a party. The fun comes from systems interacting at scale: polling, voter blocs, national trends, coalition negotiations and a large election result.

Electland started from the opposite end. Instead of beginning with a country, it begins with a town.

It generates a small fictional council area made up of wards, local voter clusters and recognisable bits of political geography: affluent commuter areas, estates with poor services, student neighbourhoods, older town centres, villages at the edge of the borough. The map is still important, but it is no longer the whole game. A ward is somewhere you actually campaign, potentially represent, and might have to abandon at the next election if you lose it.

That smaller scale makes the political questions more personal. You are not just trying to improve a party’s national vote share. You are trying to become a councillor, stay one, build enough influence to matter, and survive the consequences of the decisions you make.

## From party leader to actual person

The first versions of Electland were much closer to the older game than they are now. They were focused on parties fighting over wards: campaign actions, ward polling, election night, alliances, standing-down pacts, coalitions and even redistricting.

That was a good foundation. The election engine already had a lot of the things I wanted:

* voters with different values and priorities;
* local tags which make one ward care more about services, growth or change than another;
* weekly campaigning instead of one instant dice roll;
* softmax voting, so elections have uncertainty rather than every voter robotically choosing the closest party;
* campaign boosts which decay, rather than stacking forever;
* alliances where a party can stand aside and endorse another candidate in a specific ward.

But a party-level game has a fairly obvious ending: win some seats, form a government, start again. I wanted the game to keep being interesting when you were a single person inside the council.

So Electland gained a **single-politician mode**. You name your councillor, choose a party, build approval in a ward and then play through an actual local political career. You can be a backbencher, become influential in your group, chair things, become deputy leader, lead the council, or just be the councillor who keeps campaigning and occasionally causes trouble.

Most importantly, losing does not now mean “game over”. If you lose an election, you are out of the council for a cycle. You can decide where to stand next time, try to regain your party’s support, campaign from outside, and come back. That felt much closer to the sort of long, slightly bruising political careers I wanted to simulate.

## Council politics is more fun when it is awkward

National coalition formation in the Political Playground is about big ideological compatibility: how far apart are parties, which ministries do they want, and can they form a viable government?

Electland does still have council control and coalitions, but its newer centre is the council chamber.

Every few weeks there is a single piece of legislation: sometimes generated from a larger pool of local issues, sometimes something the player writes themselves. You can give a proposal a title, description and tags that tell the simulation what it is really about: services, housing, development, the environment, change, growth, and so on.

Then the game shows you what the councillors are likely to do.

That means votes are not just a generic “for/against” button. A proposal has party positions, individual probabilities of support, local consequences, and the possibility of lobbying people before the session. The person proposing a motion will actually vote for it now, which sounds obvious, but was apparently something I had to teach the simulation.

The party whip is also no longer a mysterious faceless force. If your party has more than one councillor, the whip is the most influential one. If you are the only councillor from your party, there is no imaginary boss telling you off. Small details like that matter a lot in a game where the point is meant to be the people inside the institution.

## Relationships, rather than just percentages

The Political Playground has party relationships. Electland has people.

Each councillor can become an ally, rival, friend, useful contact or somebody you have repeatedly irritated. Relationships affect lobbying and vote-trading; they also give the council a bit more of a story than a coloured seat bar ever could on its own.

There is still a coloured seat display, because I love a coloured seat display. But the current council composition is now always visible as a little set of dots, alongside who is governing and whether the council is hung. Political contacts show their names *and* parties, rather than requiring you to memorise which tiny dot is which.

This is probably the biggest difference in tone between the two projects. The Political Playground is a mathematical toy about electorates. Electland is trying to be a small political drama generator. The maths is still underneath it, but I want the player to remember that Councillor Patel backed their library motion, or that the local party leader never forgave them for voting against a housing scheme.

## Making them was very different too

The Political Playground has had three fairly clear lives. It began as a Python command-line project full of random calls and `if/else` statements, became a Next.js experiment while I was learning JavaScript, and eventually became a static React and Vite app because it did not need a server at all.

Its development was quite slow and exploratory. I was working out what a voting model could even look like: individual voter samples, voter blocs, distance calculations across seven values, trends, loyalty and turnout. A lot of the work was about making the simulation less obviously gameable. If every voter sits on one bell curve, the best party is always just “be more centrist”, which is not a very interesting game.

Electland inherited that experience, but was made in a much more iterative way.

The initial version appeared as a React/Vite project in April, with a huge simulation file, a SVG ward map and a newspaper-style interface. Then it grew in concentrated bursts:

* wards and local polling;
* a cleaner front page and election flow;
* events, ideological changes and campaign automation;
* statistics, incumbency records and election-night reveals;
* alliances, endorsements, standing-down pacts and NPC coalitions;
* redistricting, save files and council budgets;
* a fairly major cleanup of old data and abandoned UI ideas.

Then, in the latest development pass, I gave the project a much more ambitious brief: turn it into a councillor simulator.

That meant fixing a lot of very unglamorous things before adding the exciting stuff. Campaign boosts needed to decay. The AI had a broken ward sort. A modal could reopen with stale budget sliders. A “party whip” could exist even when there was nobody else in the party. The setup screen was trying to do too much at once, so it became a proper multi-step game wizard instead of one intimidating wall of controls.

It also meant continuously moving the focus away from the map. Maps are fun to make, especially SVG maps you can zoom, click and redraw into new wards, but they can take over a political game very easily. Electland now treats the map as one useful view of the town, alongside a council workspace, current polling, political contacts, legislation and your own career.

## A slightly more deterministic simulation

One technical change I am particularly happy with is that Electland is much more reproducible than the original project.

The older Political Playground used plenty of normal random calls, which was fine for a personal experiment but made individual outcomes hard to reason about. Electland uses seeded randomness for its simulation where possible. The same town seed and week give consistent world-generation and decision-making behaviour, while still allowing a town to feel messy and alive.

This matters for things like alliance offers. If a computer-controlled party is considering an agreement in a ward, the player should be able to understand why it accepts or refuses; it should not appear to change its mind just because the screen rendered again.

The actual vote calculation is also more explicitly local. Party ideology still matters, but so do the ward’s tags, the local campaign effort, current events, organisation, incumbency, personal approval and any pact in force. A small score shift can change a close ward, which is exactly what makes a councillor game work: one campaign action should not rewrite the whole town, but it might be enough to save your seat.

## Still intentionally not a real council

As with the Political Playground, this is not a forecasting tool and it is not trying to be an accurate model of British local government. Real local politics has independents, hyper-local grievances, planning law, ward boundary reviews, personalities built up over decades, national media effects, strange committee structures and infinitely more paperwork than I am willing to put in a browser game.

Electland is a game about the *feeling* of a local political career. It should let you experience the satisfying bit of winning a marginal ward, the panic of a close council vote, the temptation to rebel, and the slow work of building a reputation.

The Political Playground asked: “what if I could invent a whole country and see what happens?”

Electland asks: “what if I was one councillor in a town full of people who all have their own priorities, and I still had to get the bins collected?”

I think that is a much smaller question. It is also, possibly, a more whimsical one.
