// Real example clips for Job Studio's demo mode (new users with no jobs yet).
// Cut from a completed Slicer job; scores, reasons, and transcripts are the
// pipeline's real output. Media lives in public/examples/.

export interface ExampleClip {
  id: string
  title: string
  hook: string
  score: number
  duration: number
  start: string
  startTime: number
  endTime: number
  thumbnailTime: number
  caption: string
  sourceUrl: string
  thumbnailUrl: string
  jobTitle: string
  transcript: { text: string; start: number; end: number }[]
}

export const EXAMPLE_CLIPS: ExampleClip[] = [
  {
    "id": "example-communities-show-up",
    "title": "Communities Show Up",
    "hook": "Reaction spike: “it is awesome to see all these communities come”",
    "score": 6.0,
    "duration": 30.0,
    "start": "31:39",
    "startTime": 0,
    "endTime": 30.0,
    "thumbnailTime": 5.4,
    "caption": "it is awesome to see all",
    "sourceUrl": "/examples/communities-show-up.mp4",
    "thumbnailUrl": "/examples/communities-show-up.jpg",
    "jobTitle": "Example · Nifty Island Is The Reason I Got Into Web3!!!",
    "transcript": [
      {
        "text": "it is awesome to see all",
        "start": 4.61,
        "end": 6.53
      },
      {
        "text": "these communities come together bring utility",
        "start": 6.53,
        "end": 9.15
      },
      {
        "text": "to all these projects and for",
        "start": 9.15,
        "end": 10.97
      },
      {
        "text": "the community to bring utility to",
        "start": 10.97,
        "end": 13.07
      },
      {
        "text": "their projects and other projects through",
        "start": 13.07,
        "end": 15.05
      },
      {
        "text": "this game nifty island i just",
        "start": 15.05,
        "end": 17.53
      },
      {
        "text": "started i'm having an insane time",
        "start": 17.53,
        "end": 20.11
      },
      {
        "text": "i want to start learning how",
        "start": 20.11,
        "end": 21.87
      },
      {
        "text": "to create stuff You know, it",
        "start": 21.87,
        "end": 23.21
      },
      {
        "text": "is a great time to learn",
        "start": 23.21,
        "end": 24.57
      },
      {
        "text": "how to use these platforms like",
        "start": 24.57,
        "end": 25.95
      },
      {
        "text": "blenders to create 3D assets, 3D",
        "start": 25.95,
        "end": 28.41
      },
      {
        "text": "models, put them in games.",
        "start": 28.41,
        "end": 30.0
      }
    ]
  },
  {
    "id": "example-upgrade-your-gear",
    "title": "Upgrade Your Gear",
    "hook": "Reaction spike: “This is where you're going to upgrade your island.”",
    "score": 5.0,
    "duration": 30.0,
    "start": "30:58",
    "startTime": 0,
    "endTime": 30.0,
    "thumbnailTime": 17.4,
    "caption": "I could talk about Nifty Island",
    "sourceUrl": "/examples/upgrade-your-gear.mp4",
    "thumbnailUrl": "/examples/upgrade-your-gear.jpg",
    "jobTitle": "Example · Nifty Island Is The Reason I Got Into Web3!!!",
    "transcript": [
      {
        "text": "I could talk about Nifty Island",
        "start": 0.49,
        "end": 1.59
      },
      {
        "text": "for a long time, but let's",
        "start": 1.59,
        "end": 2.91
      },
      {
        "text": "talk about one more thing. The",
        "start": 2.91,
        "end": 4.29
      },
      {
        "text": "hub of your island is the",
        "start": 4.29,
        "end": 5.83
      },
      {
        "text": "campfire. This is where you're going",
        "start": 5.83,
        "end": 6.67
      },
      {
        "text": "to upgrade your island. Make sure",
        "start": 6.67,
        "end": 9.01
      },
      {
        "text": "you're burning blooms because this will",
        "start": 9.01,
        "end": 10.79
      },
      {
        "text": "allow you to craft items and",
        "start": 10.79,
        "end": 11.85
      },
      {
        "text": "upgrade. And these are the type",
        "start": 11.85,
        "end": 13.71
      },
      {
        "text": "of upgrades you can do, right?",
        "start": 13.71,
        "end": 14.89
      },
      {
        "text": "You can expand your island. you",
        "start": 14.99,
        "end": 16.57
      },
      {
        "text": "can increase the build weight so",
        "start": 16.57,
        "end": 18.23
      },
      {
        "text": "you can put more things on",
        "start": 18.23,
        "end": 19.05
      },
      {
        "text": "your island you can create more",
        "start": 19.05,
        "end": 20.31
      },
      {
        "text": "games you can put more blooms",
        "start": 20.17,
        "end": 21.59
      },
      {
        "text": "on your island so when people",
        "start": 21.59,
        "end": 22.53
      },
      {
        "text": "come to visit they can collect",
        "start": 22.53,
        "end": 23.51
      },
      {
        "text": "and blooms you can customize this",
        "start": 23.39,
        "end": 26.09
      },
      {
        "text": "island's ocean so these are all",
        "start": 26.09,
        "end": 28.25
      },
      {
        "text": "the upgrades you can when do",
        "start": 28.25,
        "end": 29.95
      }
    ]
  },
  {
    "id": "example-item-shop-walkthrough",
    "title": "Item Shop Walkthrough",
    "hook": "Reaction spike: “items so if you go to press B and”",
    "score": 5.0,
    "duration": 30.0,
    "start": "21:26",
    "startTime": 0,
    "endTime": 30.0,
    "thumbnailTime": 16.2,
    "caption": "put it and there is a",
    "sourceUrl": "/examples/item-shop-walkthrough.mp4",
    "thumbnailUrl": "/examples/item-shop-walkthrough.jpg",
    "jobTitle": "Example · Nifty Island Is The Reason I Got Into Web3!!!",
    "transcript": [
      {
        "text": "put it and there is a",
        "start": 0.0,
        "end": 1.66
      },
      {
        "text": "lot of stock items so if",
        "start": 1.66,
        "end": 3.0
      },
      {
        "text": "you go to press B and",
        "start": 3.0,
        "end": 4.46
      },
      {
        "text": "you go in these here are",
        "start": 4.46,
        "end": 5.46
      },
      {
        "text": "all the stock items that they",
        "start": 5.46,
        "end": 7.28
      },
      {
        "text": "give you they give you trees",
        "start": 7.28,
        "end": 8.72
      },
      {
        "text": "literally you can put in so",
        "start": 8.56,
        "end": 9.76
      },
      {
        "text": "you just click the tree and",
        "start": 9.76,
        "end": 11.34
      },
      {
        "text": "you can literally just in put",
        "start": 11.34,
        "end": 12.32
      },
      {
        "text": "it so I want to put",
        "start": 12.32,
        "end": 13.24
      },
      {
        "text": "in a tree right there right",
        "start": 13.24,
        "end": 14.38
      },
      {
        "text": "tree right there and then if",
        "start": 14.38,
        "end": 16.9
      },
      {
        "text": "I go to Terraform and say",
        "start": 16.86,
        "end": 18.4
      },
      {
        "text": "Terraform I can actually you know",
        "start": 18.4,
        "end": 21.04
      },
      {
        "text": "lower I can bring the land",
        "start": 21.04,
        "end": 23.0
      },
      {
        "text": "down put the land up build",
        "start": 23.0,
        "end": 26.24
      },
      {
        "text": "upon the land oops sorry build",
        "start": 26.24,
        "end": 27.8
      },
      {
        "text": "upon the land",
        "start": 27.8,
        "end": 28.58
      }
    ]
  },
  {
    "id": "example-foot-race-setup",
    "title": "Foot Race Setup",
    "hook": "Kill/payoff moment: “to do a foot race right so I'll just”",
    "score": 5.0,
    "duration": 30.0,
    "start": "25:46",
    "startTime": 0,
    "endTime": 30.0,
    "thumbnailTime": 13.8,
    "caption": "points the blooms people collect the",
    "sourceUrl": "/examples/foot-race-setup.mp4",
    "thumbnailUrl": "/examples/foot-race-setup.jpg",
    "jobTitle": "Example · Nifty Island Is The Reason I Got Into Web3!!!",
    "transcript": [
      {
        "text": "points the blooms people collect the",
        "start": 0.0,
        "end": 1.93
      },
      {
        "text": "blooms you collect and the points",
        "start": 1.93,
        "end": 3.51
      },
      {
        "text": "you get for airdrop the that",
        "start": 3.51,
        "end": 4.93
      },
      {
        "text": "will be coming in the near",
        "start": 4.93,
        "end": 5.97
      },
      {
        "text": "future you want to collect the",
        "start": 5.97,
        "end": 7.07
      },
      {
        "text": "and points you want to do",
        "start": 6.95,
        "end": 8.07
      },
      {
        "text": "all these activities so I'll show",
        "start": 8.07,
        "end": 9.41
      },
      {
        "text": "you simply game how to make",
        "start": 9.41,
        "end": 10.29
      },
      {
        "text": "a it is super cool you",
        "start": 10.29,
        "end": 12.21
      },
      {
        "text": "press G you press create game",
        "start": 12.21,
        "end": 14.19
      },
      {
        "text": "say you want to do foot",
        "start": 14.19,
        "end": 15.75
      },
      {
        "text": "a race right so I'll just",
        "start": 15.37,
        "end": 16.61
      },
      {
        "text": "say race to the end right",
        "start": 16.61,
        "end": 21.21
      },
      {
        "text": "and you description can put a",
        "start": 21.21,
        "end": 21.93
      },
      {
        "text": "of you want foot race you",
        "start": 22.05,
        "end": 24.03
      },
      {
        "text": "go let's begin and then all",
        "start": 24.03,
        "end": 25.63
      },
      {
        "text": "you do is you do a",
        "start": 25.63,
        "end": 27.41
      },
      {
        "text": "starting point so you're in the",
        "start": 27.41,
        "end": 29.21
      },
      {
        "text": "Builder here let's",
        "start": 29.21,
        "end": 30.0
      }
    ]
  }
]
