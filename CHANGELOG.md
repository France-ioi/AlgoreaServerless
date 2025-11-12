# Changelog
All notable changes to this project will be documented in this file.

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
