Add a mergeConfig function to config.ts that layers a partial AppConfig over the defaults. Feature
flags should combine rather than replace, and an unknown region should throw rather than fall back
to dk silently.
