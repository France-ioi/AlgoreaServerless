# Changelog
All notable changes to this project will be documented in this file.

## 2.1.3 - 2026-02-04
- respond with a 401 instead of a 500 when providing an identity token instead of a thread token

## 2.1.2 - 2026-02-03
- proper REST response for DELETE/POST follow and notification services

## 2.1.1 - 2026-02-02
- add a service to get the follow status

## 2.1.0 - 2026-01-28
- backend for the portal which interfaces with Stripe for paid content (still in progress)
- handle websocket connect/disconnect: keep user<->connectionId binding
- support for event-bus events
- implement event-bus events: submission created, grade saved, thread status change
- authenication via portal token, thread token or identity token, via middlewares
- async notification system
- thread following system
- add clean logging all accross the project
- complete refactoring of the project

## v2.0.8 - 2025-11-12
- make token verification failure a decoding error so that we send a 4xx instead of 5xx

## v2.0.7 - 2025-11-12
- do not require to be owner or to be able to watch to get messages
- improve token verification (check expiration)

## v2.0.6 - 2025-10-16
- fix: do not create an parsing loop on parsing error. handle GoneException

## v2.0.5 - 2025-10-16
- return the error correctly on 500
- fix the way we return responses

## v2.0.4 - 2025-10-13
- enable autoprune in serverless
- add description to lambda function

## v2.0.3 - 2025-10-10
- fix the fix: proper "created" response when posting a message

## v2.0.2 - 2025-10-10
- fix: proper "created" response when posting a message

## v2.0.1 - 2025-10-10
- use a single handler for both ws and rest

## v2.0.0 - 2025-10-09
- initial release of the completely refactored multi-purposed REST+Websocket serverless app (previously "forum")
