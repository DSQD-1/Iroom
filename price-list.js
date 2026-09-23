const PRICE_LIST = [

  /* =====================================================
     IPHONE 17e
  ===================================================== */

  {
    category: "iPhone",
    name: "iPhone 17e",
    memory: "256GB",
    color: "Black",
    version: "🇺🇸 eSIM",
    price: 65200
  },
  {
    category: "iPhone",
    name: "iPhone 17e",
    memory: "256GB",
    color: "Pink",
    version: "🇺🇸 eSIM",
    price: 63900
  },
  {
    category: "iPhone",
    name: "iPhone 17e",
    memory: "256GB",
    color: "Black",
    version: "🇮🇳",
    price: 75000
  },
  {
    category: "iPhone",
    name: "iPhone 17e",
    memory: "256GB",
    color: "White",
    version: "🇮🇳",
    price: 66900
  },
  {
    category: "iPhone",
    name: "iPhone 17e",
    memory: "512GB",
    color: "Black",
    version: "🇯🇵",
    price: 71000
  },
  {
    category: "iPhone",
    name: "iPhone 17e",
    memory: "512GB",
    color: "White",
    version: "🇯🇵",
    price: 73200
  },
  {
    category: "iPhone",
    name: "iPhone 17e",
    memory: "512GB",
    color: "Soft Pink",
    version: "🇯🇵",
    price: 74200
  },

  /* =====================================================
     IPHONE 17
  ===================================================== */

  ...[
    ["🇯🇵","256GB","Black",86000],
    ["🇯🇵","256GB","Blue",84200],
    ["🇯🇵","256GB","White",84500],
    ["🇯🇵","256GB","Lavender",84200],
    ["🇯🇵","256GB","Sage",84500],

    ["🇮🇳","256GB","Black",86000],
    ["🇮🇳","256GB","Blue",85000],
    ["🇮🇳","256GB","White",85000],
    ["🇮🇳","256GB","Lavender",86200],
    ["🇮🇳","256GB","Sage",85000],

    ["🇯🇵","512GB","Black",97000],
    ["🇯🇵","512GB","Blue",99000],
    ["🇯🇵","512GB","White",99500],
    ["🇯🇵","512GB","Sage",103000],
    ["🇯🇵","512GB","Lavender",102000],

    ["🇮🇳","512GB","Black",97900],
    ["🇮🇳","512GB","Blue",100700],
    ["🇮🇳","512GB","White",99900],
    ["🇮🇳","512GB","Lavender",103000],
    ["🇮🇳","512GB","Sage",103000]
  ].map(([version,memory,color,price]) => ({
    category: "iPhone",
    name: "iPhone 17",
    memory,
    color,
    version,
    price
  })),

  /* =====================================================
     IPHONE 17 AIR
  ===================================================== */

  ...[
    ["🇯🇵","256GB","Black",82200],
    ["🇯🇵","256GB","Blue",81200],
    ["🇯🇵","256GB","White",82200],
    ["🇯🇵","256GB","Gold",80600],

    ["🇯🇵","512GB","Black",88000],
    ["🇯🇵","512GB","White",91900],
    ["🇯🇵","512GB","Gold",86500],

    ["🇯🇵","1TB","Black",97200],
    ["🇯🇵","1TB","Blue",91400],
    ["🇯🇵","1TB","Gold",96500]
  ].map(([version,memory,color,price]) => ({
    category: "iPhone",
    name: "iPhone 17 Air",
    memory,
    color,
    version,
    price
  })),

  /* =====================================================
     IPHONE 17 PRO
  ===================================================== */

  ...[
    ["🇯🇵","256GB","Silver",104200],
    ["🇯🇵","256GB","Orange",102500],
    ["🇯🇵","256GB","Blue",103500],

    ["🇭🇰","256GB","Silver",112000],
    ["🇭🇰","256GB","Orange",107200],
    ["🇭🇰","256GB","Blue",108600],

    ["🇯🇵","512GB","Silver",120600],
    ["🇯🇵","512GB","Orange",115700],
    ["🇯🇵","512GB","Blue",121400],

    ["🇭🇰","512GB","Silver",128500],
    ["🇭🇰","512GB","Orange",124200],
    ["🇭🇰","512GB","Blue",130200],

    ["🇯🇵","1TB","Silver",143000],
    ["🇯🇵","1TB","Orange",126000],
    ["🇯🇵","1TB","Blue",130900],

    ["🇭🇰","1TB","Silver",154000],
    ["🇭🇰","1TB","Orange",140800]
  ].map(([version,memory,color,price]) => ({
    category: "iPhone",
    name: "iPhone 17 Pro",
    memory,
    color,
    version,
    price
  })),

  /* =====================================================
     IPHONE 17 PRO MAX
  ===================================================== */

  ...[
    ["🇯🇵","256GB","Silver",113000],
    ["🇯🇵","256GB","Orange",109800],
    ["🇯🇵","256GB","Blue",110600],

    ["🇭🇰","256GB","Silver",120600],
    ["🇭🇰","256GB","Orange",116200],
    ["🇭🇰","256GB","Blue",117200],

    ["🇯🇵","512GB","Silver",132000],
    ["🇯🇵","512GB","Orange",123800],
    ["🇯🇵","512GB","Blue",126100],

    ["🇭🇰","512GB","Silver",141800],
    ["🇭🇰","512GB","Orange",134200],
    ["🇭🇰","512GB","Blue",136600],

    ["🇯🇵","1TB","Silver",152600],
    ["🇯🇵","1TB","Orange",140900],
    ["🇯🇵","1TB","Blue",141200],

    ["🇭🇰","1TB","Orange",166000],
    ["🇭🇰","1TB","Blue",166200],

    ["🇯🇵","2TB","Silver",167000],
    ["🇯🇵","2TB","Orange",151700],
    ["🇯🇵","2TB","Blue",151400],

    ["🇭🇰","2TB","Silver",182500],
    ["🇭🇰","2TB","Orange",172600],
    ["🇭🇰","2TB","Blue",180600]
  ].map(([version,memory,color,price]) => ({
    category: "iPhone",
    name: "iPhone 17 Pro Max",
    memory,
    color,
    version,
    price
  })),

  /* =====================================================
     IPHONE 13
  ===================================================== */

  {
    category: "iPhone",
    name: "iPhone 13",
    memory: "128GB",
    color: "Midnight",
    version: "🇮🇳",
    price: 49800
  },

  /* =====================================================
     IPHONE 14
  ===================================================== */

  ...[
    ["Midnight",59900],
    ["Blue",59300],
    ["Purple",59500]
  ].map(([color,price]) => ({
    category: "iPhone",
    name: "iPhone 14",
    memory: "512GB",
    color,
    version: "🇮🇳",
    price
  })),

  {
    category: "iPhone",
    name: "iPhone 14 Plus",
    memory: "256GB",
    color: "Red",
    version: "🇦🇪",
    price: 57500
  },

  /* =====================================================
     IPHONE 15
  ===================================================== */

  ...[
    ["128GB","Black",59800],
    ["128GB","Blue",59300],
    ["256GB","Black",70200],
    ["256GB","Blue",69900],
    ["256GB","Pink",74000],
    ["256GB","Green",73500],
    ["512GB","Blue",77700],
    ["512GB","Green",77700],
    ["512GB","Pink",78200]
  ].map(([memory,color,price]) => ({
    category: "iPhone",
    name: "iPhone 15",
    memory,
    color,
    version: "🇮🇳",
    price
  })),

  {
    category: "iPhone",
    name: "iPhone 15",
    memory: "512GB",
    color: "Yellow",
    version: "🇦🇪🇪🇺",
    price: 75300
  },
  {
    category: "iPhone",
    name: "iPhone 15",
    memory: "512GB",
    color: "Yellow",
    version: "🇯🇵",
    price: 75300
  },

  {
    category: "iPhone",
    name: "iPhone 15 Plus",
    memory: "128GB",
    color: "Pink",
    version: "🇮🇳",
    price: 65900
  },
  {
    category: "iPhone",
    name: "iPhone 15 Plus",
    memory: "512GB",
    color: "Green",
    version: "🇮🇳",
    price: 72500
  },

  {
    category: "iPhone",
    name: "iPhone 15 Pro",
    memory: "128GB",
    color: "Blue",
    version: "🇦🇪🇪🇺",
    price: 87900
  },
  {
    category: "iPhone",
    name: "iPhone 15 Pro",
    memory: "512GB",
    color: "Black",
    version: "🇦🇪🇪🇺",
    price: 107400
  },

  {
    category: "iPhone",
    name: "iPhone 15 Pro Max",
    memory: "256GB",
    color: "Natural",
    version: "🇦🇪🇪🇺",
    price: 97500
  },

  /* =====================================================
     IPHONE 16e
  ===================================================== */

  {
    category: "iPhone",
    name: "iPhone 16e",
    memory: "256GB",
    color: "White",
    version: "🇨🇳",
    price: 51200
  },
  {
    category: "iPhone",
    name: "iPhone 16e",
    memory: "256GB",
    color: "Black",
    version: "🇨🇳",
    price: 51200
  },
  {
    category: "iPhone",
    name: "iPhone 16e",
    memory: "512GB",
    color: "Black",
    version: "🇮🇳",
    price: 60500
  },
  {
    category: "iPhone",
    name: "iPhone 16e",
    memory: "512GB",
    color: "White",
    version: "🇮🇳",
    price: 60700
  },

  /* =====================================================
     IPHONE 16
  ===================================================== */

  ...[
    ["128GB","Black",69700],
    ["128GB","Pink",71200],
    ["128GB","White",69600],
    ["128GB","Teal",69600],
    ["128GB","Ultramarine",70400],
    ["256GB","Black",80000],
    ["256GB","Teal",80500]
  ].map(([memory,color,price]) => ({
    category: "iPhone",
    name: "iPhone 16",
    memory,
    color,
    version: "🇮🇳",
    price
  })),

  /* =====================================================
     IPHONE 16 PLUS
  ===================================================== */

  ...[
    ["128GB","Black",82000],
    ["128GB","Pink",78900],
    ["128GB","Teal",78900],
    ["128GB","Ultramarine",78900],
    ["128GB","White",78900],
    ["256GB","Black",86800],
    ["256GB","Pink",86600],
    ["256GB","Teal",86000],
    ["256GB","White",86600],
    ["256GB","Ultramarine",86400],
    ["512GB","Pink",96500],
    ["512GB","Ultramarine",94700]
  ].map(([memory,color,price]) => ({
    category: "iPhone",
    name: "iPhone 16 Plus",
    memory,
    color,
    version: "🇮🇳",
    price
  })),

  {
    category:"iPhone", name:"iPhone 16 Plus",
    memory:"512GB", color:"Black", version:"🇺🇸", price:88600
  },
  {
    category:"iPhone", name:"iPhone 16 Plus",
    memory:"512GB", color:"Pink", version:"🇺🇸", price:88400
  },
  {
    category:"iPhone", name:"iPhone 16 Plus",
    memory:"512GB", color:"Teal", version:"🇯🇵", price:96500
  },
  {
    category:"iPhone", name:"iPhone 16 Plus",
    memory:"512GB", color:"White", version:"🇦🇪", price:94700
  },

  /* =====================================================
     IPHONE 16 PRO
  ===================================================== */

  {
    category:"iPhone", name:"iPhone 16 Pro",
    memory:"128GB", color:"Desert", version:"🇨🇳 2 SIM", price:98900
  },
  {
    category:"iPhone", name:"iPhone 16 Pro",
    memory:"128GB", color:"Natural", version:"🇨🇳 2 SIM", price:96400
  },
  {
    category:"iPhone", name:"iPhone 16 Pro",
    memory:"128GB", color:"White", version:"🇨🇳 2 SIM", price:92900
  },
  {
    category:"iPhone", name:"iPhone 16 Pro",
    memory:"128GB", color:"Natural", version:"🇮🇳", price:98500
  },
  {
    category:"iPhone", name:"iPhone 16 Pro",
    memory:"1TB", color:"White", version:"🇦🇪", price:126700
  },

  /* =====================================================
     IPHONE 16 PRO MAX
  ===================================================== */

  ...[
    ["🇺🇸","256GB","Natural",105200],
    ["🇺🇸","256GB","White",105200],
    ["🇮🇳","256GB","Desert",103600],
    ["🇮🇳","256GB","White",116500],
    ["🇺🇸","512GB","Black",115300],
    ["🇺🇸","512GB","Natural",115300],
    ["🇺🇸","512GB","White",115300],
    ["🇮🇳","512GB","Desert",119200],
    ["🇮🇳","1TB","Desert",122500],
    ["🇮🇳","1TB","Natural",123700]
  ].map(([version,memory,color,price]) => ({
    category:"iPhone",
    name:"iPhone 16 Pro Max",
    memory,
    color,
    version,
    price
  })),

  /* =====================================================
     AIRPODS
  ===================================================== */

  {
    category:"AirPods",
    name:"EarPods USB-C",
    memory:"",
    color:"",
    version:"Проводные",
    price:3500
  },
  {
    category:"AirPods",
    name:"AirPods Pro 3",
    memory:"",
    color:"",
    version:"USB-C",
    price:19990
  },
  {
    category:"AirPods",
    name:"AirPods Pro 2",
    memory:"",
    color:"",
    version:"USB-C",
    price:15900
  },
  {
    category:"AirPods",
    name:"AirPods 4",
    price:11500
  },
  {
    category:"AirPods",
    name:"AirPods 4 ANC",
    version:"Шумоподавление",
    price:15990
  },
  {
    category:"AirPods",
    name:"AirPods Max 2",
    color:"Midnight / Orange / Starlight / Purple / Blue",
    price:41990,
    fromPrice:true
  },

  /* =====================================================
     APPLE WATCH
  ===================================================== */

  {
    category:"Apple Watch",
    name:"Apple Watch SE 2 (2024)",
    memory:"40mm",
    price:19000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch SE 2 (2024)",
    memory:"44mm",
    price:17500,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch SE 3 (2025)",
    memory:"40mm",
    price:22000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch SE 3 (2025)",
    memory:"44mm",
    price:23500,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch 10 (2024)",
    memory:"42mm",
    price:27000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch 10 (2024)",
    memory:"46mm",
    price:29500,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch 11 (2025)",
    memory:"42mm",
    price:30000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch 11 (2025)",
    memory:"46mm",
    price:31500,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch 11 Titanium (2025)",
    memory:"42mm",
    color:"Milanese Loop",
    price:61000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch 11 Titanium (2025)",
    memory:"46mm",
    color:"Milanese Loop",
    price:66000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch Ultra",
    memory:"49mm",
    price:55000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch Ultra 2 (2024)",
    memory:"49mm",
    price:52500,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch Ultra 2 (2024)",
    memory:"49mm",
    color:"Milanese Loop",
    price:63500,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch Ultra 3 (2025)",
    memory:"49mm",
    price:62000,
    fromPrice:true
  },
  {
    category:"Apple Watch",
    name:"Apple Watch Ultra 3 (2025)",
    memory:"49mm",
    color:"Milanese Loop",
    price:74500,
    fromPrice:true
  },

  /* =====================================================
     APPLE ACCESSORIES
  ===================================================== */

  {
    category:"Apple аксессуары",
    name:"Apple Pencil USB-C",
    price:9500
  },
  {
    category:"Apple аксессуары",
    name:"Apple Pencil 2",
    price:9500
  },
  {
    category:"Apple аксессуары",
    name:"Apple Pencil Pro",
    price:11500
  },
  {
    category:"Apple аксессуары",
    name:"Magic Keyboard",
    memory:"iPad Pro 11",
    price:30500
  },
  {
    category:"Apple аксессуары",
    name:"Magic Keyboard",
    memory:"iPad Pro 13",
    price:33500
  },
  {
    category:"Apple аксессуары",
    name:"Magic Keyboard",
    memory:"iPad Air 11",
    price:35500
  },

  /* =====================================================
     IPAD 11
  ===================================================== */

  ...[
    ["128GB","Wi-Fi","Blue / Yellow / Pink / Silver",42500],
    ["128GB","LTE","Blue / Pink / Yellow / Silver",47000],
    ["256GB","Wi-Fi","Blue / Yellow / Pink / Silver",48500],
    ["256GB","LTE","Blue / Silver / Pink",56500],
    ["512GB","Wi-Fi","Blue / Silver",62500]
  ].map(([memory,version,color,price]) => ({
    category:"iPad",
    name:"iPad 11 (2025)",
    memory,
    version,
    color,
    price,
    fromPrice:true
  })),

  /* =====================================================
     IPAD MINI 7
  ===================================================== */

  ...[
    ["128GB","Wi-Fi","Blue / Purple / Gray / Starlight",42000],
    ["128GB","LTE","Gray / Blue / Purple / Starlight",56000],
    ["256GB","Wi-Fi","Blue / Purple / Gray / Starlight",53000],
    ["256GB","LTE","Blue / Gray / Purple / Starlight",74000],
    ["512GB","Wi-Fi","Blue / Purple / Gray / Starlight",71000],
    ["512GB","LTE","Blue / Purple / Gray / Starlight",103500]
  ].map(([memory,version,color,price]) => ({
    category:"iPad",
    name:"iPad Mini 7 (2024)",
    memory,
    version,
    color,
    price,
    fromPrice:true
  })),

  /* =====================================================
     IPAD AIR 11 M3 / M4
  ===================================================== */

  ...[
    ["M3","128GB","Wi-Fi","Blue / Purple / Gray / Starlight",47500],
    ["M3","256GB","Wi-Fi","Blue / Purple / Gray / Starlight",58500],
    ["M3","128GB","LTE","Gray / Blue",67000],
    ["M3","256GB","LTE","Gray / Starlight / Blue",78500],

    ["M4","128GB","Wi-Fi","Blue / Purple / Gray / Starlight",50500],
    ["M4","128GB","LTE","Blue / Purple / Gray / Starlight",71000],
    ["M4","256GB","Wi-Fi","Blue / Purple / Gray / Starlight",62000],
    ["M4","256GB","LTE","Blue / Purple / Gray / Starlight",83000],
    ["M4","512GB","Wi-Fi","Blue / Purple / Gray / Starlight",89500],
    ["M4","512GB","LTE","Blue / Purple / Gray / Starlight",108500],
    ["M4","1TB","Wi-Fi","Blue / Purple / Gray / Starlight",127500],
    ["M4","1TB","LTE","Blue / Purple / Gray / Starlight",135500]
  ].map(([chip,memory,version,color,price]) => ({
    category:"iPad",
    name:`iPad Air 11 ${chip}`,
    memory,
    version,
    color,
    price,
    fromPrice:true
  })),

  /* =====================================================
     IPAD AIR 13
  ===================================================== */

  ...[
    ["M3","128GB","Wi-Fi","Gray / Blue / Starlight / Purple",63500],
    ["M3","128GB","LTE","Blue / Purple / Gray / Starlight",77500],

    ["M4","128GB","Wi-Fi","Gray / Blue / Purple / Starlight",70500],
    ["M4","128GB","LTE","Blue / Gray",88500],
    ["M4","256GB","Wi-Fi","Gray / Blue / Purple / Starlight",80000],
    ["M4","256GB","LTE","Gray / Blue / Purple / Starlight",105000],
    ["M4","512GB","Wi-Fi","Gray / Blue / Purple / Starlight",120500],
    ["M4","512GB","LTE","Gray / Blue / Purple / Starlight",135500],
    ["M4","1TB","Wi-Fi","Gray / Starlight",135000],
    ["M4","1TB","LTE","Gray / Blue / Purple / Starlight",158000]
  ].map(([chip,memory,version,color,price]) => ({
    category:"iPad",
    name:`iPad Air 13 ${chip}`,
    memory,
    version,
    color,
    price,
    fromPrice:true
  })),

  /* =====================================================
     IPAD PRO 11
  ===================================================== */

  {
    category:"iPad",
    name:"iPad Pro 11 M4 (2024)",
    memory:"256GB",
    version:"LTE",
    color:"Black / Silver",
    price:92000,
    fromPrice:true
  },
  {
    category:"iPad",
    name:"iPad Pro 11 M4 (2024)",
    memory:"512GB",
    version:"Wi-Fi",
    color:"Black / Silver",
    price:92000,
    fromPrice:true
  },

  ...[
    ["256GB","Wi-Fi","Black / Silver",83500],
    ["256GB","LTE","Black",94500],
    ["512GB","Wi-Fi","Black / Silver",105000],
    ["512GB","LTE","Black / Silver",130000]
  ].map(([memory,version,color,price]) => ({
    category:"iPad",
    name:"iPad Pro 11 M5 (2025)",
    memory,
    version,
    color,
    price,
    fromPrice:true
  })),

  /* =====================================================
     IPAD PRO 13
  ===================================================== */

  ...[
    ["M4","256GB","Wi-Fi","Black / Silver",98000],
    ["M4","512GB","Wi-Fi","Black / Silver",124500],
    ["M5","256GB","Wi-Fi","Black / Silver",106000],
    ["M5","256GB","LTE","Black / Silver",105000],
    ["M5","512GB","Wi-Fi","Black / Silver",128000],
    ["M5","512GB","LTE","Black / Silver",132500]
  ].map(([chip,memory,version,color,price]) => ({
    category:"iPad",
    name:`iPad Pro 13 ${chip}`,
    memory,
    version,
    color,
    price,
    fromPrice:true
  })),

  {
    category:"iPad",
    name:"iPad Pro 13 M4 (2024)",
    memory:"1TB / 2TB",
    price:158000,
    fromPrice:true
  },
  {
    category:"iPad",
    name:"iPad Pro 13 M5 (2025)",
    memory:"1TB / 2TB",
    price:167000,
    fromPrice:true
  },

  /* =====================================================
     MACBOOK
  ===================================================== */

  {
    category:"Mac",
    name:"MacBook NEO (A18)",
    memory:"8GB / 256GB",
    price:58500,
    fromPrice:true
  },
  {
    category:"Mac",
    name:"MacBook NEO (A18)",
    memory:"8GB / 512GB",
    price:65000,
    fromPrice:true
  },

  ...[
    ["MacBook Air 13 (M4)","16GB / 256GB",85500],
    ["MacBook Air 13 (M4)","16GB / 512GB",96000],
    ["MacBook Air 13 (M4)","16GB / 1TB",108000],
    ["MacBook Air 13 (M4)","24GB / 512GB",113500],
    ["MacBook Air 13 (M4)","24GB / 1TB",131000],
    ["MacBook Air 13 (M4)","32GB / 512GB",144500],
    ["MacBook Air 13 (M4)","32GB / 1TB",165000],

    ["MacBook Air 15 (M4)","16GB / 256GB",93000],
    ["MacBook Air 15 (M4)","16GB / 512GB",110000],
    ["MacBook Air 15 (M4)","16GB / 1TB",138000],
    ["MacBook Air 15 (M4)","24GB / 512GB",128000],
    ["MacBook Air 15 (M4)","32GB / 512GB",171000],

    ["MacBook Air 13 (M5)","16GB / 512GB",134000],
    ["MacBook Air 13 (M5)","16GB / 1TB",null],
    ["MacBook Air 13 (M5)","24GB / 1TB",null],
    ["MacBook Air 13 (M5)","32GB / 1TB",null],

    ["MacBook Air 15 (M5)","16GB / 512GB",155000],
    ["MacBook Air 15 (M5)","16GB / 1TB",null],
    ["MacBook Air 15 (M5)","24GB / 1TB",null],
    ["MacBook Air 15 (M5)","32GB / 1TB",null],

    ["MacBook Pro 14 (M4)","16GB / 1TB",148500],
    ["MacBook Pro 14 (M4)","24GB / 1TB (Pro)",195000],

    ["MacBook Pro 14 (M5)","16GB / 512GB",143000],
    ["MacBook Pro 14 (M5)","16GB / 1TB",145500],
    ["MacBook Pro 14 (M5)","24GB / 1TB",162500],
    ["MacBook Pro 14 (M5)","32GB / 1TB",177500],

    ["MacBook Pro 14 (M5 Pro)","24GB / 1TB",186000],
    ["MacBook Pro 14 (M5 Pro)","24GB / 2TB",229000],

    ["MacBook Pro 14 (M5 Max)","36GB / 2TB",303000],

    ["MacBook Pro 16 (M4 Max)","48GB / 1TB",369000],

    ["MacBook Pro 16 (M5 Pro)","24GB / 1TB",222500],
    ["MacBook Pro 16 (M5 Pro)","48GB / 1TB",275000],

    ["MacBook Pro 16 (M5 Max)","36GB / 2TB",333500],
    ["MacBook Pro 16 (M5 Max)","48GB / 2TB",380000]
  ].map(([name,memory,price]) => ({
    category:"Mac",
    name,
    memory,
    price,
    fromPrice: price !== null
  })),

  /* =====================================================
     MAGIC MOUSE
  ===================================================== */

  {
    category:"Apple аксессуары",
    name:"Magic Mouse USB-C",
    color:"Black",
    price:11000
  },
  {
    category:"Apple аксессуары",
    name:"Magic Mouse USB-C",
    color:"White",
    price:10000
  },

  /* =====================================================
     DYSON — STRAIGHTENERS
  ===================================================== */

  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Apricot Topaz",
    price:36000,
    foreignPrice:null
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Prussian Blue",
    price:35000,
    foreignPrice:31300
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Nickel/Copper",
    price:null,
    foreignPrice:32000
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Ceramic Pink/Rose",
    price:32500,
    foreignPrice:34700
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Strawberry Bronze/Blush Pink",
    price:35000,
    foreignPrice:37000
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Red Velvet",
    price:38500,
    foreignPrice:42000
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Kanzan Pink",
    price:null,
    foreignPrice:42000
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Amber Silk",
    price:34000,
    foreignPrice:33800
  },
  {
    category:"Dyson",
    name:"Dyson HT01",
    color:"Jasper Plum",
    price:null,
    foreignPrice:36000
  },

  /* =====================================================
     DYSON HS05
  ===================================================== */

  ...[
    ["Nickel/Copper",null,43000],
    ["Origin (без кейса)",36000,30000],
    ["Ceramic Pop",null,37500],
    ["Onyx Gold",null,40000],
    ["Strawberry Bronze/Blush Pink",50000,null],
    ["Fuchsia/Nickel",null,53000],
    ["Prussian Blue",null,41000],
    ["Blue Blush",null,47000],
    ["Black/Gold Onyx",null,47000]
  ].map(([color,price,foreignPrice]) => ({
    category:"Dyson",
    name:"Dyson HS05",
    color,
    price,
    foreignPrice
  })),

  /* =====================================================
     DYSON HS08
  ===================================================== */

  ...[
    ["Apricot Topaz",39500,42900],
    ["Amber Silk",35500,33300],
    ["Ceramic Pink/Rose Gold",35500,36900],
    ["Ceramic Pink/Rose Gold (Diffuse)",35800,38500],
    ["Ceramic Patina/Topaz",35500,39500],
    ["Ceramic Patina/Topaz (Diffuse)",35300,39000],
    ["Vinca Blue/Topaz",null,33500],
    ["Vinca Blue/Topaz (Diffuse)",35200,39000],
    ["Prussian Blue/Copper",36200,34900],
    ["Jasper Plum",null,41500],
    ["Red Velvet",40000,39900],
    ["Kanzan Pink",null,41000]
  ].map(([color,price,foreignPrice]) => ({
    category:"Dyson",
    name:"Dyson HS08",
    color,
    price,
    foreignPrice
  })),

  /* =====================================================
     DYSON HS09
  ===================================================== */

  ...[
    ["Ceramic Pink/Rose Gold",null,46300],
    ["Jasper Plum",46500,46000],
    ["Amber Silk",46400,49500],
    ["Red Velvet",49000,47800],
    ["Apricot Topaz",48000,46000]
  ].map(([color,price,foreignPrice]) => ({
    category:"Dyson",
    name:"Dyson HS09",
    color,
    price,
    foreignPrice
  })),

  /* =====================================================
     DYSON HAIR DRYERS
  ===================================================== */

  ...[
    ["HD07","Prussian Blue/Copper",30800,null],
    ["HD08","Blue/Copper",null,39000],
    ["HD15","Nickel/Copper",28500,null],
    ["HD16","Ceramic Pink/Rose Gold",31000,31500],
    ["HD16","Vinca Blue/Topaz",33000,34000],
    ["HD16","Red Velvet",null,35500],
    ["HD16","Amber Silk",null,34700],
    ["HD16","Apricot Topaz",37900,null],
    ["HD17","Ceramic Pink/Rose Gold",34500,34500],
    ["HD17","Jasper Plum",35000,39500],
    ["HD17","Kanzan Pink",null,40000],
    ["HD18","Vinca Blue/Topaz",41500,null]
  ].map(([model,color,price,foreignPrice]) => ({
    category:"Dyson",
    name:`Dyson ${model}`,
    color,
    price,
    foreignPrice
  })),

  /* =====================================================
     DYSON VACUUMS
  ===================================================== */

  ...[
    ["V8","Silver/Nickel",null,27500],
    ["V8","Yellow/Nickel",null,29000],
    ["V8","Black",30000,null],
    ["V10","Absolute",null,37000],
    ["V11","Extra",null,40000],
    ["V11","Advanced",null,46000],
    ["V12 Slim","Absolute",46500,43000],
    ["V12s","Yellow/Nickel",45300,46000],
    ["V12s","Gold/Gold",null,46500],
    ["V15","Yellow/Nickel",null,46000],
    ["V15","Gold/Gold",51800,null],
    ["V15s","Submarine",57000,null],
    ["V16","",59400,null],
    ["V16s","",69500,null],
    ["Gen5","Purple",55700,null],
    ["Gen5","Blue/Copper",56000,null],
    ["PencilVac","Black",48500,47200],
    ["PencilVac","Fluffycone",51500,47200],
    ["PencilWash","",50000,null],
    ["Wash G1","",null,41000],
    ["Clean+Wash Hygiene","",60000,null],
    ["Spot+Scrub AI","",110000,null],
    ["Big Ball Absolute 2","Blue",49000,null],
    ["Big Ball Parquet 2","",45000,null],
    ["360 Navi Robot","",null,74000]
  ].map(([name,color,price,foreignPrice]) => ({
    category:"Dyson",
    name:`Dyson ${name}`,
    color,
    price,
    foreignPrice
  })),

  /* =====================================================
     DYSON PURIFIERS
  ===================================================== */

  ...[
    ["HJ10","Black/Teal",37500,null],
    ["HJ10","White/Silver",37300,37200],
    ["HJ10","Compact",40000,null],
    ["PH05","White/Gold",70000,69000],
    ["BP04","Blue/Gold",null,83000],
    ["TP10","White/Silver",null,45000],
    ["TP11","White",null,45000],
    ["TP11","Black/Nickel",null,45000],
    ["TP12","White/Gold",null,52000]
  ].map(([name,color,price,foreignPrice]) => ({
    category:"Dyson",
    name:`Dyson ${name}`,
    color,
    price,
    foreignPrice
  })),

  /* =====================================================
     PLAYSTATION
  ===================================================== */

  {
    category:"PlayStation",
    name:"PlayStation 5 Slim Digital",
    memory:"825GB",
    price:53500
  },
  {
    category:"PlayStation",
    name:"PlayStation 5 Slim Digital",
    memory:"1TB",
    price:57000
  },
  {
    category:"PlayStation",
    name:"PlayStation 5 Slim Disk",
    memory:"1TB",
    price:61000
  },
  {
    category:"PlayStation",
    name:"PlayStation 5 Pro",
    memory:"2TB",
    version:"1 рев",
    price:110000
  },
  {
    category:"PlayStation",
    name:"PlayStation 5 Pro",
    memory:"2TB",
    version:"2 рев",
    price:112000
  },
  {
    category:"PlayStation",
    name:"PS5 Slim Digital",
    version:"30th Anniversary",
    price:63500
  },
  {
    category:"PlayStation",
    name:"PS5 Portal",
    color:"White",
    price:28500
  },
  {
    category:"PlayStation",
    name:"PS5 Portal",
    color:"Black",
    price:28500
  },
  {
    category:"PlayStation",
    name:"PS5 VR2",
    price:37000
  },
  {
    category:"PlayStation",
    name:"PS5 VR2",
    version:"Horizon Bundle",
    price:37500
  },

  /* =====================================================
     PS5 ACCESSORIES
  ===================================================== */

  ...[
    ["PS5 Disc Drive Slim/Pro",9800],
    ["PS5 Vertical Stand Analog",3100],
    ["PS5 Vertical Stand 1:1",3600],
    ["PS5 Vertical Stand Slim/Pro",4800],
    ["PS5 DualSense Charging Station Lux",3700],
    ["PS5 DualSense Charging Station Original UAE",4800],
    ["PS5 DualSense Charging Station Original EU",4600]
  ].map(([name,price]) => ({
    category:"PlayStation аксессуары",
    name,
    price
  })),

  /* =====================================================
     PS5 GAMEPADS
  ===================================================== */

  ...[
    ["Классические цвета",6950],
    ["Chrome Collection",8400],
    ["Лимитированные версии",10000],
    ["DualSense Edge",17000],
    ["Nacon Revolution 5 Pro",17000]
  ].map(([name,price]) => ({
    category:"PlayStation геймпады",
    name,
    price,
    fromPrice:true
  })),

  /* =====================================================
     AUDIO
  ===================================================== */

  ...[
    ["Sony Pulse Elite","White",12500],
    ["Sony Pulse Elite","Black",12500],
    ["Pulse Explore","White",13800],
    ["PS5 3D Pulse Camo","",9800],
    ["Sony WF-1000XM6","",26500],
    ["PowerBeats Pro 2","",19000],
    ["JBL Boombox 3 Squad","",27500]
  ].map(([name,color,price]) => ({
    category:"Audio",
    name,
    color,
    price
  })),

  /* =====================================================
     SMART / AI
  ===================================================== */

  {
    category:"Smart / AI",
    name:"Plaud Note Pin S AI Voice Recorder",
    price:22500
  },
  {
    category:"Smart / AI",
    name:"Plaud NotePin Wristband",
    price:8000
  },

  /* =====================================================
     META / VR
  ===================================================== */

  {
    category:"Meta / VR",
    name:"Meta Quest 3S",
    memory:"128GB",
    price:32700
  },
  {
    category:"Meta / VR",
    name:"Meta Quest 3S",
    memory:"256GB",
    price:35500
  },
  {
    category:"Meta / VR",
    name:"Meta Quest 3",
    memory:"512GB",
    price:48500
  },

  /* =====================================================
     XBOX
  ===================================================== */

  {
    category:"Xbox",
    name:"Xbox Series S",
    memory:"512GB",
    price:40500
  },
  {
    category:"Xbox",
    name:"Xbox Series X",
    memory:"1TB",
    version:"Disk",
    price:56500
  },
  {
    category:"Xbox",
    name:"Xbox Series X",
    memory:"1TB",
    version:"Digital",
    price:53000
  },
  {
    category:"Xbox",
    name:"Xbox Controller",
    price:6000
  },

  /* =====================================================
     PORTABLE
  ===================================================== */

  ...[
    ["Steam Deck OLED","512GB",61500],
    ["Steam Deck OLED","1TB",67500],
    ["Lenovo Go S","1TB",76000],
    ["Lenovo Legion Go Z1 Extreme","",64000],
    ["ASUS ROG Ally X","512GB",56500],
    ["ASUS ROG Ally X","1TB",90500],
    ["MSI Claw","",49500]
  ].map(([name,memory,price]) => ({
    category:"Portable",
    name,
    memory,
    price,
    fromPrice:name === "MSI Claw"
  })),

  /* =====================================================
     NINTENDO
  ===================================================== */

  {
    category:"Nintendo",
    name:"Nintendo Switch 2",
    price:45000
  },
  {
    category:"Nintendo",
    name:"Nintendo Switch OLED",
    color:"Neon",
    price:29000
  },
  {
    category:"Nintendo",
    name:"Nintendo Switch OLED",
    color:"White",
    price:30000
  },
  {
    category:"Nintendo",
    name:"Nintendo Switch Lite",
    price:20300,
    priceMax:20400
  },
  {
    category:"Nintendo",
    name:"Switch 2 Pro Controller",
    price:8700
  },
  {
    category:"Nintendo",
    name:"NSW2 Pro Controller",
    color:"Resident Evil",
    price:11000
  },
  {
    category:"Nintendo",
    name:"Switch 2 Joy-Con",
    color:"Green/Pink",
    price:8500
  },
  {
    category:"Nintendo",
    name:"MicroSD Express",
    memory:"256GB",
    price:7400
  },
  {
    category:"Nintendo",
    name:"MicroSD Express",
    memory:"512GB",
    price:12000
  },
  {
    category:"Nintendo",
    name:"Switch 2 Carrying Case",
    price:6300
  },
  {
    category:"Nintendo",
    name:"Switch 2 Deluxe System Case",
    price:9000
  },
  {
    category:"Nintendo",
    name:"Switch 2 Camera",
    price:6500
  },

  /* =====================================================
     CAMERAS / ACTION
  ===================================================== */

  ...[
    ["GoPro Hero 13 Black","",28500],
    ["GoPro Hero 13 Bundle","",36000],
    ["INSTA360 GO 3S","",25500],
    ["INSTA360 Ace Pro 2","",29000],
    ["INSTA360 X3","",28600],
    ["INSTA360 X4","",34000],
    ["INSTA360 X5","",41500],
    ["INSTA360 GO Ultra","",38000],
    ["DJI Osmo Pocket","",44800],
    ["DJI Osmo Action","",42000],
    ["DJI Mic 3","",20500],
    ["DJI Ronin RS4","",31500],
    ["Kodak Charmera Camera","",7800]
  ].map(([name,memory,price]) => ({
    category:"Камеры",
    name,
    memory,
    price,
    fromPrice:[
      "INSTA360 GO 3S",
      "INSTA360 Ace Pro 2",
      "INSTA360 GO Ultra",
      "DJI Osmo Pocket",
      "DJI Mic 3",
      "DJI Ronin RS4"
    ].includes(name)
  })),

  /* =====================================================
     PHOTO
  ===================================================== */

  ...[
    ["Canon EOS R7",102500],
    ["Canon EOS R6 Mark II",150500],
    ["Nikon D780",99500],
    ["Nikon Z6 III",137500],
    ["Nikon D850",137500]
  ].map(([name,price]) => ({
    category:"Фотоаппараты",
    name,
    price
  })),

  /* =====================================================
     INSTAX
  ===================================================== */

  {
    category:"Instax / Fujifilm",
    name:"Instax Mini 12",
    price:12000
  },
  {
    category:"Instax / Fujifilm",
    name:"Instax Mini Evo",
    price:19000,
    fromPrice:true
  },
  {
    category:"Instax / Fujifilm",
    name:"Instax Wide 400",
    price:17200
  },
  {
    category:"Instax / Fujifilm",
    name:"Instax Film",
    memory:"10",
    price:2100
  },
  {
    category:"Instax / Fujifilm",
    name:"Instax Film",
    memory:"20",
    price:2800
  },

  /* =====================================================
     WEARABLES
  ===================================================== */

  {
    category:"Wearables",
    name:"Oura Ring 4",
    price:40000,
    fromPrice:true
  },
  {
    category:"Wearables",
    name:"Oura Ceramic",
    price:40000,
    fromPrice:true
  },

  {
    category:"Whoop",
    name:"PowerPack",
    price:12300
  },
  {
    category:"Whoop",
    name:"Peak Series",
    price:14000,
    fromPrice:true
  },
  {
    category:"Whoop",
    name:"Life Series",
    price:15000,
    fromPrice:true
  },

  /* =====================================================
     SMART GLASSES
  ===================================================== */

  {
    category:"Smart Glasses",
    name:"Meta Ray-Ban",
    price:31000,
    fromPrice:true
  },
  {
    category:"Smart Glasses",
    name:"Wayfarer Gen2",
    price:41300
  },
  {
    category:"Smart Glasses",
    name:"Headliner Gen2",
    price:42000
  },
  {
    category:"Smart Glasses",
    name:"Meta Ray-Ban Display",
    price:121000
  },

  /* =====================================================
     REMARKABLE / KINDLE
  ===================================================== */

  {
    category:"Remarkable / Kindle",
    name:"Remarkable Marker",
    price:12000
  },
  {
    category:"Remarkable / Kindle",
    name:"Remarkable Type Folio",
    price:33000
  },
  {
    category:"Remarkable / Kindle",
    name:"Remarkable Book Folio",
    price:18000,
    priceMax:21000
  },
  {
    category:"Remarkable / Kindle",
    name:"Kindle Colorsoft",
    price:24000
  },
  {
    category:"Remarkable / Kindle",
    name:"Kindle Colorsoft Kids",
    price:25500
  },

  /* =====================================================
     PERIPHERALS
  ===================================================== */

  {
    category:"Периферия",
    name:"Logitech G29",
    price:23500
  },
  {
    category:"Периферия",
    name:"Logitech G923",
    price:30500
  },
  {
    category:"Периферия",
    name:"Logitech Driving Force Shifter",
    price:6500
  },

  /* =====================================================
     SAMSUNG
  ===================================================== */

  ...[
    ["A17","4/128",12500],
    ["A26","6/128",16500],
    ["A36","8/256",23500],
    ["A37","8/128",27000],
    ["A37","8/256",28000],
    ["A57","8/128",30500],
    ["A57","12/512",39500],
    ["S25 FE","8/128",38000],
    ["S25 Edge","12/256",52000],
    ["S25+","12/256",56000],
    ["S25 Ultra","12/256",71500],
    ["S25 Ultra","12/512",80500],
    ["S25 Ultra","12/1TB",81500],
    ["S26","12/256",56500],
    ["S26","12/512",68500],
    ["S26+","12/256",69500],
    ["S26+","12/512",76500],
    ["S26 Ultra","12/256",83000],
    ["S26 Ultra","12/512",94500],
    ["S26 Ultra","16/1TB",108500],
    ["Z Fold 7","12/256",109500]
  ].map(([name,memory,price]) => ({
    category:"Samsung",
    name,
    memory,
    price
  })),

  /* =====================================================
     XIAOMI / REDMI / POCO
  ===================================================== */

  ...[
    ["Redmi A3 Pro","4/128",7500],
    ["Redmi A7 Pro","4/64",8500],
    ["Redmi 15C","4/256 NFC",10500],
    ["Redmi 15","6/128",12500],
    ["Note 14S","8/256",17500],
    ["Note 15","8/256",17000],
    ["Note 15 Pro 4G","8/256",21000],
    ["Note 15 Pro 5G","8/256",25000],
    ["Note 15 Pro+ 5G","8/256",30000],
    ["Note 15 Pro+ 5G","12/512",34500],
    ["Xiaomi 15T","12/256",38500],
    ["Xiaomi 15T Pro","12/256",53000],
    ["Xiaomi 15T Pro","12/512",58500],
    ["Xiaomi 15T Pro","12/1TB",70000],
    ["Xiaomi 15","12/256",55000],
    ["Xiaomi 15","12/512",57000],
    ["Xiaomi 17","12/512",74000],
    ["Xiaomi 17 Ultra","16/512",109500],
    ["Xiaomi 17 Ultra","16/1TB",122000]
  ].map(([name,memory,price]) => ({
    category:"Xiaomi / Redmi / POCO",
    name,
    memory,
    price
  })),

  /* =====================================================
     GOOGLE PIXEL
  ===================================================== */

  ...[
    ["Pixel 8a","8/128",26500],
    ["Pixel 9 Pro","16/128",56500],
    ["Pixel 9 Pro Fold","256",71500],
    ["Pixel 10 Pro Fold","256",88000],
    ["Pixel 10","128",53000],
    ["Pixel 10","256",60500],
    ["Pixel 10 Pro","16/128",68500],
    ["Pixel 10 Pro","16/256",74500],
    ["Pixel 10 Pro","16/512",88000],
    ["Pixel 10 Pro","16/1TB",108000],
    ["Pixel 10 Pro XL","16/256",80500],
    ["Pixel 10 Pro XL","1TB",115500]
  ].map(([name,memory,price]) => ({
    category:"Google Pixel",
    name,
    memory,
    price
  })),

  /* =====================================================
     ONEPLUS
  ===================================================== */

  ...[
    ["OnePlus 13","12/256",58500],
    ["OnePlus 13s","12/256",45000],
    ["OnePlus 13s","12/512",52000],
    ["OnePlus 15","12/256",67500],
    ["OnePlus 15","12/512",64000],
    ["OnePlus 15","16/512",67000],
    ["OnePlus 15R","12/256",45000],
    ["OnePlus 15R","12/512",49000],
    ["OnePlus Nord 5","8/256",33500],
    ["OnePlus Nord 5","12/512",37000]
  ].map(([name,memory,price]) => ({
    category:"OnePlus",
    name,
    memory,
    price
  })),

  /* =====================================================
     HONOR / HUAWEI
  ===================================================== */

  ...[
    ["Honor X7d","8/128",14500],
    ["Honor X9d","8/256",25500],
    ["Honor X9d","12/256",27500],
    ["Honor 400 Lite","8/256",21500],
    ["Honor 400","8/256",30500],
    ["Honor 400 Pro","12/256",47500],
    ["Honor Magic 7","12/256",54500],
    ["Honor Magic 7 Pro","12/512",63500],
    ["Honor Magic 8 Pro","12/512",80500],
    ["Honor Magic 8 Pro","16/1TB",87000],
    ["Huawei Nova 14i","8/128",12500],
    ["Huawei Pura 80","12/256",40000],
    ["Huawei Pura 80 Pro","12/512",59500],
    ["Huawei Pura 80 Ultra","16/512",80000],
    ["Huawei Mate 70 Pro","12/512",57000],
    ["Huawei Mate 80 Pro","16/512",67000],
    ["Huawei Mate X7","16/512",121000]
  ].map(([name,memory,price]) => ({
    category:"Honor / Huawei",
    name,
    memory,
    price
  }))

];

module.exports = PRICE_LIST;