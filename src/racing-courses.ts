export const courses = [
  { id: 'morning', name: '晨光環線', style: '均衡', description: '長直道接大彎，練習甩尾與飛躍。', points: [[0,0],[0,-130],[80,-235],[220,-230],[280,-110],[225,5],[330,120],[250,230],[110,220],[5,155],[-105,105],[-90,20]] },
  { id: 'meadow', name: '花谷巡遊', style: '流暢', description: '寬緩連彎，維持速度與連續加速。', points: [[0,0],[0,-120],[65,-220],[185,-230],[290,-150],[310,-20],[255,80],[185,190],[65,220],[-65,160],[-100,65],[-70,10]] },
  { id: 'fern', name: '蕨葉溪谷', style: '技術', description: '連續反向彎，提早選線、抓準出彎。', points: [[0,0],[0,-110],[70,-220],[190,-215],[275,-135],[170,-90],[165,5],[290,65],[285,170],[150,225],[30,190],[-75,105],[-95,20]] },
];
const requested = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('course');
export const course = courses.find(c => c.id === requested) ?? courses[0];
export const raceRecordKey = course.id === 'morning' ? 'echo-forest-race-best-v1' : `echo-forest-race-${course.id}-best-v1`;
