#!/usr/bin/env node
/**
 * Generate detailed trip execution plans for all outings.
 * Run: node generate_detailed_plans.js
 * Output: data/detailed-plans.json
 */
const fs = require('fs');
const path = require('path');

const outings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'default-outings.json'), 'utf8'));

// ─── Location-specific data ─────────────────────────────────────
const locationData = {
  "Nandi Hills & Isha Foundation (Chikkaballapur)": {
    distance_km: 65, drive_hours: 1.5, altitude: "1478m", best_season: "Oct–Feb",
    difficulty: "Easy", route: "Bangalore → Devanahalli → Chikkaballapur → Nandi Hills",
    alt_route: "Bangalore → Yelahanka → Air Force Station Rd → Nandi Hills",
    hospitals: ["Chikkaballapur District Hospital (08156-272010)", "Akash Hospital Devanahalli (080-27640333)"],
    police: "Nandi Hills Police Station (08156-262100)",
    entry_fee: "₹20/person + ₹50 parking",
    attractions: ["Tipu Sultan's Summer Palace", "Yoga Nandeeshwara Temple", "Amrita Sarovar Lake", "Adiyogi Shiva Statue (112 ft)", "Dhyanalinga"],
    food_spots: ["Nandi Hills Restaurant", "Local dhabas on highway", "Isha Foundation Canteen"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "3:30 AM", report: "3:15 AM" },
      { name: "Hebbal Flyover (Shell Petrol Bunk)", time: "3:50 AM", report: "3:35 AM" },
      { name: "Manyata Tech Park Gate", time: "4:00 AM", report: "3:45 AM" },
      { name: "Yelahanka Satellite Town", time: "4:15 AM", report: "4:00 AM" }
    ]
  },
  "Bheemeshwari": {
    distance_km: 105, drive_hours: 2.5, altitude: "400m", best_season: "Aug–Feb",
    difficulty: "Moderate", route: "Bangalore → Kanakapura → Malavalli → Bheemeshwari",
    alt_route: "Bangalore → Ramanagara → Channapatna → Bheemeshwari",
    hospitals: ["Malavalli Government Hospital (08231-622345)", "BGS Hospital Mysore Rd (080-28602444)"],
    police: "Malavalli Police Station (08231-622233)",
    entry_fee: "₹100/person (Jungle Lodges)",
    attractions: ["Cauvery River Kayaking", "Coracle Ride", "Zipline", "Nature Trail", "Bird Watching"],
    food_spots: ["Jungle Lodges Restaurant", "Kamat Upachar (Highway)", "Local fish fry stalls"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "5:30 AM", report: "5:15 AM" },
      { name: "Jayanagar 4th Block", time: "5:45 AM", report: "5:30 AM" },
      { name: "Banashankari BDA Complex", time: "6:00 AM", report: "5:45 AM" },
      { name: "Nice Road Junction (Kanakapura)", time: "6:15 AM", report: "6:00 AM" }
    ]
  },
  "Chikmagalur": {
    distance_km: 250, drive_hours: 5, altitude: "1090m", best_season: "Sep–Mar",
    difficulty: "Moderate", route: "Bangalore → Tumkur → Tiptur → Kadur → Chikmagalur",
    alt_route: "Bangalore → Hassan → Chikmagalur (via NH75)",
    hospitals: ["District Hospital Chikmagalur (08262-230321)", "Indiana Hospital (08262-222272)"],
    police: "Chikmagalur Town Police (08262-232333)",
    entry_fee: "₹150 Mullayanagiri, ₹20 Hebbe Falls",
    attractions: ["Mullayanagiri Peak", "Coffee Plantation Tour", "Hebbe Falls", "Baba Budangiri", "Hirekolale Lake"],
    food_spots: ["Town Canteen", "Siri Coffee Estate", "The Amber Resort Restaurant"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Yeshwanthpur NICE Rd Junction", time: "9:50 PM", report: "9:35 PM" },
      { name: "Tumkur Road Toll Gate", time: "10:15 PM", report: "10:00 PM" }
    ]
  },
  "Mysore": {
    distance_km: 150, drive_hours: 3, altitude: "770m", best_season: "All Year",
    difficulty: "Easy", route: "Bangalore → Ramanagara → Mandya → Mysore",
    alt_route: "Bangalore → Kanakapura → Malavalli → Mysore",
    hospitals: ["JSS Hospital Mysore (0821-2548400)", "Columbia Asia Mysore (0821-3989999)"],
    police: "Mysore City Police (0821-2418100)",
    entry_fee: "₹70 Palace, ₹25 Chamundi Hills",
    attractions: ["Mysore Palace", "Chamundi Hills", "Brindavan Gardens", "St. Philomena's Church", "Devaraja Market"],
    food_spots: ["Vinayaka Mylari (Dosa)", "Hotel RRR (Biryani)", "Oyster Bay", "Depth N Green"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "6:30 AM", report: "6:15 AM" },
      { name: "Satellite Bus Stand (Mysore Rd)", time: "6:45 AM", report: "6:30 AM" },
      { name: "Kengeri NICE Rd Junction", time: "7:00 AM", report: "6:45 AM" },
      { name: "Ramanagara Toll", time: "7:30 AM", report: "7:15 AM" }
    ]
  },
  "Ooty": {
    distance_km: 280, drive_hours: 6, altitude: "2240m", best_season: "Oct–Jun",
    difficulty: "Easy", route: "Bangalore → Mysore → Gundlupet → Bandipur → Ooty",
    alt_route: "Bangalore → Nanjangud → Chamarajanagar → Ooty",
    hospitals: ["Government Hospital Ooty (0423-2444035)", "Lawley Hospital (0423-2443232)"],
    police: "Ooty Town Police (0423-2443025)",
    entry_fee: "₹30 Botanical Garden, ₹50 Lake boating",
    attractions: ["Botanical Garden", "Ooty Lake", "Toy Train", "Doddabetta Peak", "Tea Factory"],
    food_spots: ["Earl's Secret", "Sidewalk Cafe", "Shinkow's", "Quality Restaurant"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Satellite Bus Stand", time: "9:50 PM", report: "9:35 PM" },
      { name: "Mysore Rd Toll (Bidadi)", time: "10:15 PM", report: "10:00 PM" }
    ]
  },
  "Coorg": {
    distance_km: 265, drive_hours: 5.5, altitude: "1100m", best_season: "Oct–Mar",
    difficulty: "Easy-Moderate", route: "Bangalore → Mysore → Kushalnagar → Madikeri",
    alt_route: "Bangalore → Hassan → Somwarpet → Madikeri",
    hospitals: ["District Hospital Madikeri (08272-228345)", "Coorg Institute of Dental Sciences"],
    police: "Madikeri Town Police (08272-228233)",
    entry_fee: "₹15 Abbey Falls, ₹10 Raja Seat",
    attractions: ["Abbey Falls", "Raja Seat", "Dubare Elephant Camp", "Talacauvery", "Coffee Plantations"],
    food_spots: ["Coorg Cuisine (Pandi Curry)", "Raintree Restaurant", "Big Cup Cafe Madikeri"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Mysore Rd Toll (Bidadi)", time: "10:00 PM", report: "9:45 PM" },
      { name: "Ramanagara", time: "10:15 PM", report: "10:00 PM" }
    ]
  },
  "Wayanad": {
    distance_km: 280, drive_hours: 6, altitude: "700-2100m", best_season: "Oct–May",
    difficulty: "Moderate", route: "Bangalore → Mysore → Gundlupet → Sultan Bathery → Wayanad",
    alt_route: "Bangalore → Mysore → Nanjangud → Wayanad",
    hospitals: ["District Hospital Kalpetta (04936-202230)", "Wayanad Medicare (04936-204949)"],
    police: "Kalpetta Police Station (04936-202033)",
    entry_fee: "₹30 Edakkal Caves, ₹20 Banasura Dam",
    attractions: ["Edakkal Caves", "Banasura Sagar Dam", "Bamboo Rafting", "Wayanad Wildlife Sanctuary", "Phantom Rock"],
    food_spots: ["Jubilee Restaurant Kalpetta", "1st Floor Restaurant", "Wayanad Resorts Dining"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Satellite Bus Stand", time: "9:20 PM", report: "9:05 PM" },
      { name: "Mysore Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Gandikota": {
    distance_km: 310, drive_hours: 6, altitude: "300m", best_season: "Oct–Feb",
    difficulty: "Moderate", route: "Bangalore → Anantapur → Jammalamadugu → Gandikota",
    alt_route: "Bangalore → Penukonda → Kadiri → Gandikota",
    hospitals: ["Jammalamadugu Government Hospital (08515-252345)", "Proddatur Area Hospital"],
    police: "Jammalamadugu Police Station (08515-252233)",
    entry_fee: "Free entry",
    attractions: ["Grand Canyon of India", "Pennar River", "Gandikota Fort", "Raghunathaswamy Temple", "Astrophotography"],
    food_spots: ["APTDC Restaurant", "Local dhabas", "Camp site cooking"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Tin Factory", time: "9:20 PM", report: "9:05 PM" },
      { name: "KR Puram Toll", time: "9:40 PM", report: "9:25 PM" }
    ]
  },
  "Lepakshi": {
    distance_km: 120, drive_hours: 2.5, altitude: "500m", best_season: "All Year",
    difficulty: "Easy", route: "Bangalore → Devanahalli → Hindupur → Lepakshi",
    alt_route: "Bangalore → KIA Rd → Penukonda → Lepakshi",
    hospitals: ["Hindupur Government Hospital (08556-220345)", "Anantapur District Hospital"],
    police: "Lepakshi Police Station (08556-284100)",
    entry_fee: "Free (ASI monument)",
    attractions: ["Veerabhadra Temple", "Hanging Pillar", "Nandi Bull Statue", "Mural Paintings", "Nagalingam"],
    food_spots: ["APTDC Restaurant", "Hindupur restaurants", "Highway dhabas"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "6:30 AM", report: "6:15 AM" },
      { name: "Hebbal Flyover", time: "6:50 AM", report: "6:35 AM" },
      { name: "Yelahanka", time: "7:05 AM", report: "6:50 AM" },
      { name: "Devanahalli", time: "7:20 AM", report: "7:05 AM" }
    ]
  },
  "Sakleshpur": {
    distance_km: 220, drive_hours: 4.5, altitude: "950m", best_season: "Jun–Feb",
    difficulty: "Moderate-Hard", route: "Bangalore → Hassan → Sakleshpur",
    alt_route: "Bangalore → Mangalore Hwy → Sakleshpur",
    hospitals: ["Sakleshpur Government Hospital (08173-242345)", "Hassan District Hospital"],
    police: "Sakleshpur Police Station (08173-242233)",
    entry_fee: "₹50 (local guide)",
    attractions: ["Green Route Railway Trek", "Manjarabad Fort", "Bisle Viewpoint", "Waterfalls", "Abbi Falls"],
    food_spots: ["Hoysala Village Resort", "Sakleshpur homestays", "Highway dhabas"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "4:30 AM", report: "4:15 AM" },
      { name: "Yeshwanthpur Junction", time: "4:50 AM", report: "4:35 AM" },
      { name: "Nelamangala Toll", time: "5:15 AM", report: "5:00 AM" }
    ]
  },
  "Goa": {
    distance_km: 560, drive_hours: 10, altitude: "0-100m", best_season: "Nov–Mar",
    difficulty: "Easy", route: "Bangalore → Hubli → Goa (or Flight ~1hr)",
    alt_route: "Bangalore → Belgaum → Goa",
    hospitals: ["GMC Bambolim Goa (0832-2458727)", "Manipal Hospital Goa (0832-2882555)"],
    police: "Calangute Police Station (0832-2276033)",
    entry_fee: "Varies by beach shack / water sports",
    attractions: ["Baga Beach", "Calangute", "Fort Aguada", "Dudhsagar Falls", "Night Markets", "Water Sports"],
    food_spots: ["Britto's Baga", "Fisherman's Wharf", "Infantaria", "Thalassa"],
    pickup_points: [
      { name: "Bangalore Airport (Flight)", time: "6:00 AM", report: "4:30 AM" },
      { name: "Majestic Bus Stand (Road trip)", time: "8:00 PM", report: "7:45 PM" }
    ]
  },
  "Hassan": {
    distance_km: 190, drive_hours: 3.5, altitude: "980m", best_season: "All Year",
    difficulty: "Easy", route: "Bangalore → Tumkur → Tiptur → Hassan",
    alt_route: "Bangalore → Kunigal → Channarayapatna → Hassan",
    hospitals: ["Hassan District Hospital (08172-268345)", "Hassan Institute of Medical Sciences"],
    police: "Hassan Town Police (08172-268233)",
    entry_fee: "₹25 Belur, ₹25 Halebidu",
    attractions: ["Belur Channakeshava Temple", "Halebidu Hoysaleswara Temple", "Shettihalli Church"],
    food_spots: ["Hotel Southern Star Hassan", "GRR Malnad Oota", "Highway restaurants"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "5:30 AM", report: "5:15 AM" },
      { name: "Yeshwanthpur", time: "5:50 AM", report: "5:35 AM" },
      { name: "Tumkur Rd Toll", time: "6:15 AM", report: "6:00 AM" }
    ]
  },
  "Malpe": {
    distance_km: 400, drive_hours: 7, altitude: "0m", best_season: "Oct–May",
    difficulty: "Easy", route: "Bangalore → Shimoga → Udupi → Malpe",
    alt_route: "Bangalore → Hassan → Chikmagalur → Malpe",
    hospitals: ["KMC Hospital Manipal (0820-2571201)", "District Hospital Udupi (0820-2520218)"],
    police: "Malpe Police Station (0820-2537133)",
    entry_fee: "₹300 St. Mary's Island ferry",
    attractions: ["St. Mary's Island", "Malpe Beach", "Kaup Lighthouse", "Udupi Sri Krishna Temple"],
    food_spots: ["Mitra Samaj", "Hotel Woodlands", "Diana Restaurant", "Beach shacks"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Yeshwanthpur", time: "9:20 PM", report: "9:05 PM" },
      { name: "Tumkur Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Shimoga": {
    distance_km: 300, drive_hours: 5.5, altitude: "600m", best_season: "Jul–Dec",
    difficulty: "Moderate", route: "Bangalore → Tumkur → Shimoga",
    alt_route: "Bangalore → Davangere → Shimoga",
    hospitals: ["McGann District Hospital Shimoga (08182-228345)", "Sahyadri Hospital"],
    police: "Shimoga City Police (08182-228233)",
    entry_fee: "₹25 Jog Falls, ₹20 Safari",
    attractions: ["Jog Falls", "Sigandur Temple Boat Ride", "Tyavarekoppa Lion Safari", "Gajanur Dam"],
    food_spots: ["Hotel Jewel Rock", "Naveen Restaurant", "Local Malnad food joints"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Yeshwanthpur", time: "9:20 PM", report: "9:05 PM" },
      { name: "Tumkur Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Shivanasamudra": {
    distance_km: 130, drive_hours: 2.5, altitude: "700m", best_season: "Jul–Jan",
    difficulty: "Easy", route: "Bangalore → Kanakapura → Malavalli → Shivanasamudra",
    alt_route: "Bangalore → Maddur → Kollegal Rd → Shivanasamudra",
    hospitals: ["Malavalli Government Hospital (08231-622345)", "Kollegal Hospital"],
    police: "Shivanasamudra Police Station (08231-642233)",
    entry_fee: "₹20/person, ₹50 coracle ride",
    attractions: ["Gaganachukki Falls", "Bharachukki Falls", "Coracle Ride", "Talakadu Sand Dunes"],
    food_spots: ["Local restaurants near falls", "Malavalli town eateries", "Packed snacks recommended"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "5:30 AM", report: "5:15 AM" },
      { name: "Jayanagar 4th Block", time: "5:45 AM", report: "5:30 AM" },
      { name: "Kanakapura Rd NICE Junction", time: "6:10 AM", report: "5:55 AM" }
    ]
  },
  "Shravanabelagola": {
    distance_km: 150, drive_hours: 3, altitude: "800m", best_season: "All Year",
    difficulty: "Moderate (614 steps)", route: "Bangalore → Nelamangala → Channarayapatna → Shravanabelagola",
    alt_route: "Bangalore → Kunigal → Hassan → Shravanabelagola",
    hospitals: ["Channarayapatna Government Hospital", "Hassan District Hospital"],
    police: "Shravanabelagola Police Station (08176-257233)",
    entry_fee: "Free (shoe deposit ₹10)",
    attractions: ["Gommateshwara (57ft monolith)", "Chandragiri Hill", "Jain Temples", "Vindhyagiri Hill"],
    food_spots: ["Raghu Restaurant", "Temple town eateries", "Packed lunch recommended"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "5:30 AM", report: "5:15 AM" },
      { name: "Yeshwanthpur", time: "5:50 AM", report: "5:35 AM" },
      { name: "Nelamangala Toll", time: "6:15 AM", report: "6:00 AM" }
    ]
  },
  "Savandurga": {
    distance_km: 50, drive_hours: 1.5, altitude: "1226m", best_season: "Oct–Mar",
    difficulty: "Hard (steep)", route: "Bangalore → Ramanagara → Savandurga",
    alt_route: "Bangalore → Magadi Rd → Savandurga",
    hospitals: ["Ramanagara District Hospital (080-27271345)", "BGS Hospital Kengeri"],
    police: "Ramanagara Police Station (080-27271233)",
    entry_fee: "₹20/person (Forest dept)",
    attractions: ["Savandurga Monolith Trek", "Manchanabele Dam", "Arkavathy River", "Sunset Photography"],
    food_spots: ["Ramanagara restaurants", "Kamat Yatri Nivas", "Pack food recommended"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "4:30 AM", report: "4:15 AM" },
      { name: "Kengeri Bus Stand", time: "4:50 AM", report: "4:35 AM" },
      { name: "Ramanagara Bus Stand", time: "5:15 AM", report: "5:00 AM" }
    ]
  },
  "Ramanagara": {
    distance_km: 50, drive_hours: 1, altitude: "700m", best_season: "All Year",
    difficulty: "Moderate-Hard", route: "Bangalore → Kengeri → Ramanagara",
    alt_route: "Bangalore → Mysore Rd → Ramanagara",
    hospitals: ["Ramanagara District Hospital (080-27271345)"],
    police: "Ramanagara Police Station (080-27271233)",
    entry_fee: "₹800-1500 (activity packages)",
    attractions: ["Rock Climbing", "Rappelling", "Zip-lining", "Vulture Spotting", "Sholay Filming Location"],
    food_spots: ["Kamat Upachar", "Local restaurants", "Packed lunch from organizer"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "5:30 AM", report: "5:15 AM" },
      { name: "Kengeri Satellite Town", time: "5:50 AM", report: "5:35 AM" },
      { name: "NICE Rd Ramanagara Exit", time: "6:10 AM", report: "5:55 AM" }
    ]
  },
  "Biligiri Ranga Hills (BR Hills)": {
    distance_km: 220, drive_hours: 5, altitude: "1800m", best_season: "Oct–May",
    difficulty: "Moderate", route: "Bangalore → Kanakapura → Kollegal → BR Hills",
    alt_route: "Bangalore → Mysore → Chamarajanagar → BR Hills",
    hospitals: ["Chamarajanagar District Hospital (08226-222345)", "Kollegal Hospital"],
    police: "BR Hills Forest Range Office (08226-244250)",
    entry_fee: "₹300 Safari, ₹50 entry",
    attractions: ["Jungle Safari", "K Gudi Wilderness Camp", "Biligiri Temple", "Dodda Sampige Tree"],
    food_spots: ["K Gudi Camp Dining", "Jungle Lodges Restaurant", "Pack snacks"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Jayanagar 4th Block", time: "9:20 PM", report: "9:05 PM" },
      { name: "Kanakapura NICE Junction", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Mudumalai National Park": {
    distance_km: 260, drive_hours: 5.5, altitude: "1000m", best_season: "Oct–May",
    difficulty: "Easy-Moderate", route: "Bangalore → Mysore → Gundlupet → Mudumalai",
    alt_route: "Bangalore → Chamarajanagar → Mudumalai",
    hospitals: ["Government Hospital Gudalur (04262-261235)", "JSS Hospital Mysore"],
    police: "Theppakadu Range Office (04262-526235)",
    entry_fee: "₹350 Jeep Safari, ₹75 entry",
    attractions: ["Jeep Safari", "Elephant Camp", "Moyar River Gorge", "Theppakadu Elephant Camp"],
    food_spots: ["Jungle Retreat Dining", "Bamboo Banks Resort", "Local dhabas Masinagudi"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Satellite Bus Stand", time: "9:20 PM", report: "9:05 PM" },
      { name: "Mysore Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Masinagudi": {
    distance_km: 240, drive_hours: 5, altitude: "500m", best_season: "Oct–May",
    difficulty: "Easy-Moderate", route: "Bangalore → Mysore → Gundlupet → Masinagudi",
    alt_route: "Bangalore → Nanjangud → Gundlupet → Masinagudi",
    hospitals: ["Government Hospital Gudalur (04262-261235)", "Mysore JSS Hospital"],
    police: "Masinagudi Police (04262-526100)",
    entry_fee: "₹250 Night safari, ₹50 entry",
    attractions: ["Jungle Jeep Safari", "Sigur Plateau", "Night Safari", "Tribal Village Visit"],
    food_spots: ["Jungle Hut Resort", "Wild Elephant Eco Camp", "Local food joints"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Satellite Bus Stand", time: "9:20 PM", report: "9:05 PM" },
      { name: "Mysore Rd Toll (Bidadi)", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Agumbe": {
    distance_km: 350, drive_hours: 6.5, altitude: "830m", best_season: "Jun–Oct",
    difficulty: "Moderate-Hard", route: "Bangalore → Shimoga → Thirthahalli → Agumbe",
    alt_route: "Bangalore → Udupi → Agumbe",
    hospitals: ["Thirthahalli Government Hospital", "Shimoga McGann Hospital (08182-228345)"],
    police: "Agumbe Police Station (08181-259233)",
    entry_fee: "₹50 (ARRS entry), Trek guide ₹300",
    attractions: ["Sunset Point", "Barkana Falls Trek", "ARRS King Cobra Research", "Someshwara Wildlife"],
    food_spots: ["Doddamane Homestay", "Kasthuri Akka's Homestay", "Agumbe homestay food"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Yeshwanthpur", time: "9:20 PM", report: "9:05 PM" },
      { name: "Tumkur Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Antaragange": {
    distance_km: 70, drive_hours: 1.5, altitude: "1712m", best_season: "Sep–Mar",
    difficulty: "Moderate", route: "Bangalore → KR Puram → Kolar → Antaragange",
    alt_route: "Bangalore → Old Madras Rd → Kolar → Antaragange",
    hospitals: ["Kolar District Hospital (08152-222345)", "Sri Narasimha Hospital Kolar"],
    police: "Kolar Town Police (08152-222233)",
    entry_fee: "₹20/person",
    attractions: ["Night Trek", "Cave Exploration", "Kashi Vishwanatha Temple", "Volcanic Rock Formations"],
    food_spots: ["Kolar town restaurants", "Pack snacks for trek", "Kamat Yatri Nivas"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Tin Factory", time: "9:45 PM", report: "9:30 PM" },
      { name: "KR Puram Flyover", time: "10:00 PM", report: "9:45 PM" }
    ]
  },
  "Belum Caves": {
    distance_km: 310, drive_hours: 6, altitude: "300m", best_season: "Oct–Mar",
    difficulty: "Easy-Moderate", route: "Bangalore → Anantapur → Kurnool → Belum Caves",
    alt_route: "Bangalore → Penukonda → Tadipatri → Belum Caves",
    hospitals: ["Kurnool District Hospital", "Anantapur Government Hospital"],
    police: "Kolimigundla Police Station (08514-254233)",
    entry_fee: "₹65/person (₹35 camera)",
    attractions: ["3.5km Cave System", "Stalactite Formations", "Musical Cave", "Underground Chambers"],
    food_spots: ["APTDC Restaurant", "Kurnool restaurants", "Highway dhabas"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "4:30 AM", report: "4:15 AM" },
      { name: "Tin Factory", time: "4:50 AM", report: "4:35 AM" },
      { name: "KR Puram Toll", time: "5:05 AM", report: "4:50 AM" }
    ]
  },
  "Kodachadri": {
    distance_km: 400, drive_hours: 8, altitude: "1343m", best_season: "Sep–Jan",
    difficulty: "Hard", route: "Bangalore → Shimoga → Hosanagara → Kodachadri",
    alt_route: "Bangalore → Udupi → Kollur → Kodachadri",
    hospitals: ["Hosanagara Government Hospital", "Shimoga District Hospital"],
    police: "Hosanagara Police Station (08183-236233)",
    entry_fee: "₹100 trek permit (Forest dept)",
    attractions: ["Kodachadri Peak", "Hidlumane Falls", "Sarvajna Peetha", "Shola Forest Trail"],
    food_spots: ["Base camp food", "Kollur town restaurants", "Packed meals"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 PM", report: "8:15 PM" },
      { name: "Yeshwanthpur", time: "8:50 PM", report: "8:35 PM" },
      { name: "Tumkur Rd Toll", time: "9:20 PM", report: "9:05 PM" }
    ]
  },
  "Skandagiri": {
    distance_km: 70, drive_hours: 1.5, altitude: "1350m", best_season: "Sep–Feb",
    difficulty: "Moderate", route: "Bangalore → Devanahalli → Skandagiri",
    alt_route: "Bangalore → Yelahanka → Chikkaballapur → Skandagiri",
    hospitals: ["Chikkaballapur District Hospital (08156-272010)"],
    police: "Chikkaballapur Police Station (08156-272233)",
    entry_fee: "₹350/person (Forest dept night trek permit)",
    attractions: ["Night Trek", "Above-the-Clouds Sunrise", "Fort Ruins", "Panoramic Valley Views"],
    food_spots: ["Pack breakfast", "Chikkaballapur town restaurants", "Highway dhabas"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "10:30 PM", report: "10:15 PM" },
      { name: "Hebbal Flyover", time: "10:45 PM", report: "10:30 PM" },
      { name: "Yelahanka", time: "11:00 PM", report: "10:45 PM" }
    ]
  },
  "Bangalore": {
    distance_km: 0, drive_hours: 0, altitude: "920m", best_season: "All Year",
    difficulty: "Easy", route: "Within Bangalore — Private Cab",
    alt_route: "Metro + Cab combo",
    hospitals: ["Fortis Hospital (080-66214444)", "Manipal Hospital (080-25024444)"],
    police: "Bangalore City Police (080-22942222)",
    entry_fee: "₹25 Lalbagh, ₹20 Palace",
    attractions: ["Lalbagh", "Cubbon Park", "Bangalore Palace", "VV Puram Food St", "Commercial St"],
    food_spots: ["VV Puram Food Street", "MTR", "CTR", "Vidyarthi Bhavan"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 AM", report: "8:15 AM" },
      { name: "MG Road Metro Station", time: "8:45 AM", report: "8:30 AM" },
      { name: "Koramangala Sony Signal", time: "9:00 AM", report: "8:45 AM" }
    ]
  },
  "Coonoor": {
    distance_km: 300, drive_hours: 6.5, altitude: "1850m", best_season: "Oct–Mar",
    difficulty: "Easy", route: "Bangalore → Mysore → Gundlupet → Ooty → Coonoor",
    alt_route: "Bangalore → Salem → Mettupalayam → Coonoor",
    hospitals: ["Coonoor Government Hospital (0423-2232345)", "Lawley Hospital Ooty"],
    police: "Coonoor Town Police (0423-2232233)",
    entry_fee: "₹50 Sim's Park, ₹300 Toy Train",
    attractions: ["Sim's Park", "Dolphin's Nose", "Lamb's Rock", "Tea Factory Tour", "Toy Train"],
    food_spots: ["Quality Restaurant", "Coonoor Pastry House", "The Gateway Hotel"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Satellite Bus Stand", time: "9:20 PM", report: "9:05 PM" },
      { name: "Mysore Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Yercaud": {
    distance_km: 230, drive_hours: 4.5, altitude: "1515m", best_season: "Sep–May",
    difficulty: "Easy", route: "Bangalore → Krishnagiri → Salem → Yercaud",
    alt_route: "Bangalore → Hosur → Dharmapuri → Salem → Yercaud",
    hospitals: ["Salem Government Hospital (0427-2310345)", "Vinayaka Mission Hospital Salem"],
    police: "Yercaud Police Station (04281-222233)",
    entry_fee: "₹30 Lake, ₹20 viewpoints",
    attractions: ["Emerald Lake", "Pagoda Point", "Lady's Seat", "Bear Shola Falls", "Orange Groves"],
    food_spots: ["GRT Nature Trails Restaurant", "Hotel Tamil Nadu", "Local bakeries"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Tin Factory", time: "9:50 PM", report: "9:35 PM" },
      { name: "Attibele Toll", time: "10:20 PM", report: "10:05 PM" }
    ]
  },
  "Kodaikanal": {
    distance_km: 470, drive_hours: 8, altitude: "2133m", best_season: "Oct–Jun",
    difficulty: "Easy", route: "Bangalore → Salem → Dindigul → Kodaikanal",
    alt_route: "Bangalore → Krishnagiri → Namakkal → Kodaikanal",
    hospitals: ["Van Allen Hospital Kodaikanal (04542-241272)", "Government Hospital Kodaikanal"],
    police: "Kodaikanal Police Station (04542-241233)",
    entry_fee: "₹50 Lake, ₹25 Bryant Park",
    attractions: ["Coaker's Walk", "Kodai Lake", "Pillar Rocks", "Pine Forest", "Dolphin's Nose"],
    food_spots: ["Pastry Corner", "Tava Restaurant", "Cloud Street", "Aby's Cafe"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 PM", report: "8:15 PM" },
      { name: "Tin Factory", time: "8:50 PM", report: "8:35 PM" },
      { name: "Electronic City", time: "9:15 PM", report: "9:00 PM" }
    ]
  },
  "Puducherry": {
    distance_km: 310, drive_hours: 6, altitude: "0m", best_season: "Oct–Mar",
    difficulty: "Easy", route: "Bangalore → Krishnagiri → Villupuram → Puducherry",
    alt_route: "Bangalore → Vellore → Tindivanam → Puducherry",
    hospitals: ["JIPMER Hospital Puducherry (0413-2272380)", "Puducherry Government Hospital"],
    police: "Puducherry City Police (0413-2339999)",
    entry_fee: "₹50 Auroville, Free Promenade",
    attractions: ["White Town French Quarter", "Promenade Beach", "Auroville", "Paradise Beach", "Basilica"],
    food_spots: ["Cafe des Arts", "Le Dupleix", "Baker Street", "Villa Shanti"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Tin Factory", time: "9:20 PM", report: "9:05 PM" },
      { name: "Electronic City", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Gokarna": {
    distance_km: 490, drive_hours: 8, altitude: "0-50m", best_season: "Oct–Mar",
    difficulty: "Moderate", route: "Bangalore → Hubli → Kumta → Gokarna",
    alt_route: "Bangalore → Shimoga → Kumta → Gokarna",
    hospitals: ["Gokarna Primary Health Center", "Karwar District Hospital (08382-226345)"],
    police: "Gokarna Police Station (08386-256233)",
    entry_fee: "Free (beaches), ₹20 temple",
    attractions: ["Om Beach", "Paradise Beach", "Half Moon Beach", "Mahabaleshwar Temple", "Beach Trek"],
    food_spots: ["Namaste Cafe", "Mantra Cafe", "Pai Hotel", "Beach shacks"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 PM", report: "8:15 PM" },
      { name: "Yeshwanthpur", time: "8:50 PM", report: "8:35 PM" },
      { name: "Tumkur Rd Toll", time: "9:20 PM", report: "9:05 PM" }
    ]
  },
  "Hampi": {
    distance_km: 340, drive_hours: 6.5, altitude: "467m", best_season: "Oct–Mar",
    difficulty: "Easy-Moderate", route: "Bangalore → Chitradurga → Hospet → Hampi",
    alt_route: "Bangalore → Davangere → Hospet → Hampi",
    hospitals: ["Hospet Government Hospital (08394-228345)", "VIMS Bellary"],
    police: "Hampi Police Station (08394-241333)",
    entry_fee: "₹40 (ASI monuments), ₹500 coracle ride",
    attractions: ["Virupaksha Temple", "Tungabhadra Coracle", "Hemakuta Hill", "Hippie Island", "Royal Enclosure"],
    food_spots: ["Mango Tree Restaurant", "Laughing Buddha", "Gopi Rooftop", "Chill Out Cafe"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Yeshwanthpur", time: "9:20 PM", report: "9:05 PM" },
      { name: "Tumkur Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Jog Falls": {
    distance_km: 380, drive_hours: 7, altitude: "500m", best_season: "Jul–Dec",
    difficulty: "Moderate (830 steps)", route: "Bangalore → Shimoga → Sagar → Jog Falls",
    alt_route: "Bangalore → Haveri → Sagar → Jog Falls",
    hospitals: ["Sagar Government Hospital (08183-226345)", "Shimoga District Hospital"],
    police: "Jog Falls Police Station (08183-246233)",
    entry_fee: "₹25/person",
    attractions: ["Raja Falls", "Rani Falls", "Roarer Falls", "Rocket Falls", "830-step descent to base"],
    food_spots: ["KSTDC Restaurant at Jog", "Tunga Restaurant Sagar", "Local dhabas"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "4:30 AM", report: "4:15 AM" },
      { name: "Yeshwanthpur", time: "4:50 AM", report: "4:35 AM" },
      { name: "Tumkur Rd Toll", time: "5:15 AM", report: "5:00 AM" }
    ]
  },
  "Kabini": {
    distance_km: 220, drive_hours: 4.5, altitude: "700m", best_season: "Oct–May",
    difficulty: "Easy", route: "Bangalore → Mysore → HD Kote → Kabini",
    alt_route: "Bangalore → Nanjangud → HD Kote → Kabini",
    hospitals: ["HD Kote Government Hospital", "JSS Hospital Mysore (0821-2548400)"],
    police: "HD Kote Police Station (08228-264233)",
    entry_fee: "₹500 Boat safari, ₹350 Jeep safari",
    attractions: ["Kabini River Boat Safari", "Nagarhole Buffer Jeep Safari", "Coracle Ride", "Bird Watching"],
    food_spots: ["Kabini River Lodge", "Orange County Resort", "Jungle Lodges Dining"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Satellite Bus Stand", time: "9:50 PM", report: "9:35 PM" },
      { name: "Mysore Rd Toll (Bidadi)", time: "10:15 PM", report: "10:00 PM" }
    ]
  },
  "Munnar": {
    distance_km: 480, drive_hours: 9, altitude: "1532m", best_season: "Sep–May",
    difficulty: "Easy", route: "Bangalore → Salem → Coimbatore → Munnar",
    alt_route: "Bangalore → Mysore → Wayanad → Munnar",
    hospitals: ["Tata General Hospital Munnar (04865-231233)", "Kottayam Medical College"],
    police: "Munnar Police Station (04865-231233)",
    entry_fee: "₹90 Eravikulam, ₹25 Tea Museum",
    attractions: ["Eravikulam National Park", "Mattupetty Dam", "Tea Museum", "Echo Point", "Top Station"],
    food_spots: ["Saravana Bhavan Munnar", "Rapsy Restaurant", "SN Restaurant", "Hotel Copper Castle"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 PM", report: "8:15 PM" },
      { name: "Tin Factory", time: "8:50 PM", report: "8:35 PM" },
      { name: "Electronic City", time: "9:20 PM", report: "9:05 PM" }
    ]
  },
  "Murudeshwar": {
    distance_km: 500, drive_hours: 9, altitude: "0m", best_season: "Oct–Mar",
    difficulty: "Easy", route: "Bangalore → Shimoga → Bhatkal → Murudeshwar",
    alt_route: "Bangalore → Hubli → Kumta → Murudeshwar",
    hospitals: ["Murudeshwar Primary Health Center", "Bhatkal Government Hospital"],
    police: "Murudeshwar Police Station (08385-268233)",
    entry_fee: "Free temple, ₹10 gopura lift, ₹500 Netrani snorkeling",
    attractions: ["122ft Shiva Statue", "Murudeshwar Temple", "Netrani Island Snorkeling", "Beach Sunset"],
    food_spots: ["Naveen Beach Restaurant", "Kamat Restaurant Bhatkal", "RNS Residency"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 PM", report: "8:15 PM" },
      { name: "Yeshwanthpur", time: "8:50 PM", report: "8:35 PM" },
      { name: "Tumkur Rd Toll", time: "9:20 PM", report: "9:05 PM" }
    ]
  },
  "Nagarhole (Rajiv Gandhi National Park)": {
    distance_km: 230, drive_hours: 4.5, altitude: "700m", best_season: "Oct–May",
    difficulty: "Easy", route: "Bangalore → Mysore → Hunsur → Nagarhole",
    alt_route: "Bangalore → Madikeri → Nagarhole",
    hospitals: ["Hunsur Government Hospital (08222-252345)", "JSS Hospital Mysore"],
    police: "Nagarhole Range Office (08228-264100)",
    entry_fee: "₹350 Jeep safari, ₹75 entry",
    attractions: ["Jeep Safari", "Elephant Corridors", "Kabini Backwaters", "Tribal Museum"],
    food_spots: ["Jungle Lodges Kabini", "King's Sanctuary Dining", "Mysore restaurants"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Satellite Bus Stand", time: "9:50 PM", report: "9:35 PM" },
      { name: "Mysore Rd Toll (Bidadi)", time: "10:15 PM", report: "10:00 PM" }
    ]
  },
  "Udupi": {
    distance_km: 400, drive_hours: 7, altitude: "0m", best_season: "Oct–May",
    difficulty: "Easy", route: "Bangalore → Shimoga → Udupi",
    alt_route: "Bangalore → Hassan → Chikmagalur → Udupi",
    hospitals: ["KMC Hospital Manipal (0820-2571201)", "Udupi District Hospital (0820-2520218)"],
    police: "Udupi Town Police (0820-2523333)",
    entry_fee: "Free temple, ₹300 St. Mary's ferry",
    attractions: ["Sri Krishna Matha", "Malpe Beach", "St. Mary's Island", "Kaup Lighthouse"],
    food_spots: ["Mitra Samaj", "Woodlands Hotel", "Diana Restaurant", "Udupi cuisine trail"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:00 PM", report: "8:45 PM" },
      { name: "Yeshwanthpur", time: "9:20 PM", report: "9:05 PM" },
      { name: "Tumkur Rd Toll", time: "9:50 PM", report: "9:35 PM" }
    ]
  },
  "Wonderla (Bangalore)": {
    distance_km: 30, drive_hours: 0.75, altitude: "800m", best_season: "All Year",
    difficulty: "Easy", route: "Bangalore → Mysore Rd → Wonderla",
    alt_route: "Bangalore → NICE Rd → Wonderla",
    hospitals: ["BGS Hospital Kengeri (080-26720504)", "Columbia Asia Mysore Rd"],
    police: "Bidadi Police Station (080-27282233)",
    entry_fee: "₹1300–1800 (included in package)",
    attractions: ["60+ Rides", "Water Slides", "Wave Pool", "Rain Disco", "Laser Show"],
    food_spots: ["Wonderla Food Court", "Pack snacks (outside food allowed in designated area)"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 AM", report: "8:15 AM" },
      { name: "Kengeri Satellite Town", time: "8:50 AM", report: "8:35 AM" },
      { name: "NICE Rd Bidadi Exit", time: "9:05 AM", report: "8:50 AM" }
    ]
  },
  "Bandipur National Park": {
    distance_km: 220, drive_hours: 4.5, altitude: "780-1454m", best_season: "Oct–May",
    difficulty: "Easy", route: "Bangalore → Mysore → Nanjangud → Gundlupet → Bandipur",
    alt_route: "Bangalore → Ramanagara → Mandya → Bandipur",
    hospitals: ["Gundlupet Government Hospital", "JSS Hospital Mysore (0821-2548400)"],
    police: "Bandipur Range Office (08229-236052)",
    entry_fee: "₹350 Jeep safari, ₹75 entry",
    attractions: ["Tiger Safari", "Spotted Deer Herds", "Elephant Corridors", "Gopalaswamy Betta Temple"],
    food_spots: ["Bandipur Safari Lodge", "Dhole's Den Dining", "Highway restaurants"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "9:30 PM", report: "9:15 PM" },
      { name: "Satellite Bus Stand", time: "9:50 PM", report: "9:35 PM" },
      { name: "Mysore Rd Toll (Bidadi)", time: "10:15 PM", report: "10:00 PM" }
    ]
  },
  "Dandeli": {
    distance_km: 470, drive_hours: 8, altitude: "470m", best_season: "Oct–May",
    difficulty: "Moderate-Hard", route: "Bangalore → Hubli → Dharwad → Dandeli",
    alt_route: "Bangalore → Davangere → Haveri → Dandeli",
    hospitals: ["Dandeli Government Hospital (08284-231345)", "Hubli KIMS Hospital"],
    police: "Dandeli Police Station (08284-231233)",
    entry_fee: "₹200 (activities extra: Rafting ₹1200, Kayaking ₹600)",
    attractions: ["White Water Rafting", "Kayaking on Kali River", "Syntheri Rocks", "Supa Dam", "Jungle Trek"],
    food_spots: ["Dandeli Jungle Camp", "Old Magazine House", "Kali Adventure Camp"],
    pickup_points: [
      { name: "Majestic / Kempegowda Bus Stand", time: "8:30 PM", report: "8:15 PM" },
      { name: "Yeshwanthpur", time: "8:50 PM", report: "8:35 PM" },
      { name: "Tumkur Rd Toll", time: "9:20 PM", report: "9:05 PM" }
    ]
  }
};

// ─── Generate timeline based on trip type and location ──────────
function generateTimeline(outing, loc) {
  const is2d1n = outing.trip_type === '2d1n';

  if (is2d1n) {
    return [
      { time: "Day 0 — Night Departure", items: [
        `${loc.pickup_points[0].time} — Pickup begins from ${loc.pickup_points[0].name}`,
        "All pickup points completed → head count & attendance",
        "Ice-breaking games, travel playlist & snacks distributed",
        "Brief about destination, dos & don'ts",
        "Rest/sleep during night journey"
      ]},
      { time: "Day 1 — Arrival & Explore", items: [
        `~${5 + loc.drive_hours}:00 AM — Arrive at ${outing.location}, freshen up at resort/hotel`,
        "7:30 AM — Breakfast at resort",
        `9:00 AM — Visit: ${loc.attractions.slice(0, 2).join(', ')}`,
        "12:30 PM — Lunch at local restaurant",
        `2:00 PM — ${loc.attractions[2] || 'Free time & photography'}`,
        `4:00 PM — ${loc.attractions[3] || 'Sunset viewpoint & tea break'}`,
        "6:00 PM — Return to resort, freshen up",
        "7:30 PM — Dinner & campfire / group activities",
        "10:00 PM — Free time / stargazing / night walk",
        "11:00 PM — Lights out"
      ]},
      { time: "Day 2 — Morning Explore & Return", items: [
        "6:00 AM — Sunrise / morning nature walk",
        "7:30 AM — Breakfast & check-out",
        `9:00 AM — ${loc.attractions[loc.attractions.length - 1] || 'Local market & souvenir shopping'}`,
        "11:00 AM — Depart for Bangalore",
        "1:00 PM — Lunch stop en route",
        `~${11 + loc.drive_hours}:00 AM — Reach Bangalore (estimated)`,
        "Drop at respective pickup points"
      ]}
    ];
  } else {
    // One day trip
    const startHour = parseInt(outing.time) || 5;
    return [
      { time: "Morning", items: [
        `${outing.time || '5:00 AM'} — Pickup from first point: ${loc.pickup_points[0].name}`,
        `${loc.pickup_points.length > 1 ? loc.pickup_points.map(p => `${p.time} — ${p.name}`).join('; ') : ''}`,
        "En route — introductions, ice-breakers, breakfast stop if needed",
        `~${startHour + loc.drive_hours}:00 AM — Arrive at ${outing.location}`,
        `${loc.attractions[0]} — explore & photography`
      ]},
      { time: "Midday", items: [
        `${loc.attractions[1] || 'Explore local attractions'}`,
        "12:30 PM — Lunch at local restaurant / packed lunch",
        `1:30 PM — ${loc.attractions[2] || 'Free exploration time'}`
      ]},
      { time: "Afternoon", items: [
        `3:00 PM — ${loc.attractions[3] || 'Photography & group activities'}`,
        `4:30 PM — ${loc.attractions[4] || 'Sunset point / tea break'}`,
        "5:30 PM — Start return journey"
      ]},
      { time: "Evening", items: [
        "6:00 PM — Quick snack stop en route",
        `~${6 + loc.drive_hours}:00 PM — Arrive Bangalore`,
        "Drop at respective pickup points",
        "Trip coordinator collects feedback"
      ]}
    ];
  }
}

// ─── Generate meal plan ─────────────────────────────────────────
function generateMealPlan(outing, loc) {
  const is2d1n = outing.trip_type === '2d1n';
  const meals = [];
  if (is2d1n) {
    meals.push(
      { meal: "Night Snacks (Day 0)", desc: "Light snacks & water bottles provided in vehicle" },
      { meal: "Breakfast (Day 1)", desc: "South Indian / Continental at resort — Idli, Dosa, Bread, Eggs, Tea/Coffee" },
      { meal: "Lunch (Day 1)", desc: `Local cuisine at ${loc.food_spots[0]} — Veg & Non-veg options available` },
      { meal: "Evening Snacks (Day 1)", desc: "Tea/Coffee with biscuits/pakoras at resort" },
      { meal: "Dinner (Day 1)", desc: "Buffet at resort — Starter, Main Course, Dessert" },
      { meal: "Breakfast (Day 2)", desc: "Resort breakfast before check-out" },
      { meal: "Lunch (Day 2)", desc: "En route lunch stop at highway restaurant" }
    );
  } else {
    meals.push(
      { meal: "Breakfast", desc: `Morning breakfast en route / at destination — ${loc.food_spots[0]}` },
      { meal: "Lunch", desc: `${loc.food_spots[1] || loc.food_spots[0]} — Veg & Non-veg options` },
      { meal: "Snacks", desc: "Evening tea/coffee & snacks before return" }
    );
  }
  return meals;
}

// ─── Generate budget breakdown ──────────────────────────────────
function generateBudget(outing, loc) {
  const cost = outing.cost;
  const is2d1n = outing.trip_type === '2d1n';
  if (is2d1n) {
    return [
      { item: "Transportation (AC Bus/Tempo)", pct: 25, amount: Math.round(cost * 0.25) },
      { item: "Accommodation (Resort/Hotel)", pct: 30, amount: Math.round(cost * 0.30) },
      { item: "Meals (Breakfast + Lunch + Dinner)", pct: 20, amount: Math.round(cost * 0.20) },
      { item: "Entry Tickets & Activities", pct: 10, amount: Math.round(cost * 0.10) },
      { item: "Guide & Coordinator", pct: 5, amount: Math.round(cost * 0.05) },
      { item: "Emergency Buffer & Insurance", pct: 5, amount: Math.round(cost * 0.05) },
      { item: "Platform Fee & Operations", pct: 5, amount: Math.round(cost * 0.05) }
    ];
  } else {
    return [
      { item: "Transportation (AC Cab)", pct: 35, amount: Math.round(cost * 0.35) },
      { item: "Meals (Breakfast + Lunch)", pct: 25, amount: Math.round(cost * 0.25) },
      { item: "Entry Tickets & Activities", pct: 15, amount: Math.round(cost * 0.15) },
      { item: "Guide & Coordinator", pct: 10, amount: Math.round(cost * 0.10) },
      { item: "Emergency Buffer", pct: 8, amount: Math.round(cost * 0.08) },
      { item: "Platform Fee & Operations", pct: 7, amount: Math.round(cost * 0.07) }
    ];
  }
}

// ─── Generate packing list ─────────────────────────────────────
function generatePackingList(outing, loc) {
  const base = [
    "Valid Government ID Proof (Aadhaar/DL/Passport)",
    "Comfortable walking shoes / trekking shoes",
    "Water bottle (1L minimum)",
    "Sunscreen (SPF 50+) & sunglasses",
    "Personal medications (if any)",
    "Light jacket / hoodie",
    "Fully charged phone + power bank",
    "Small backpack / daypack"
  ];
  const is2d1n = outing.trip_type === '2d1n';
  if (is2d1n) {
    base.push("Extra set of clothes", "Toiletries & towel", "Torch / flashlight", "Warm layer for night");
  }
  const text = (outing.description || '').toLowerCase();
  if (/trek|climb|hill|peak/.test(text)) base.push("Trekking pole (optional)", "Energy bars / trail mix", "Raincoat / poncho");
  if (/beach|coast|sea|water/.test(text)) base.push("Swimwear", "Quick-dry towel", "Waterproof phone pouch", "Flip-flops / sandals");
  if (/safari|jungle|wildlife/.test(text)) base.push("Binoculars (optional)", "Full-sleeve top & long pants", "Insect repellent", "Camera with zoom lens");
  if (/cave|underground/.test(text)) base.push("Torch / headlamp (mandatory)", "Comfortable non-slip shoes", "Light long-sleeve top");
  if (/night trek|midnight|11.*pm|10.*pm/.test(text + ' ' + (outing.time || ''))) base.push("Headlamp / torch (mandatory)", "Warm layers", "Gloves (winter months)");
  if (/monsoon|waterfall|rain/.test(text)) base.push("Raincoat / waterproof jacket", "Waterproof bag cover", "Extra pair of socks");
  return [...new Set(base)];
}

// ─── Generate safety info ───────────────────────────────────────
function generateSafety(outing, loc) {
  return {
    emergency_contacts: {
      trip_coordinator: "+91-XXXXXXXXXX (shared 24hrs before trip)",
      vibes_helpline: "+91-9999999999",
      police: loc.police,
      nearest_hospitals: loc.hospitals,
      ambulance: "108 (Govt) / 1298 (Private)"
    },
    first_aid: [
      "Fully stocked first-aid kit carried by coordinator",
      "Band-aids, antiseptic, ORS, paracetamol, Crocin, Volini spray",
      "Crepe bandages for sprains",
      "Participants must inform pre-existing conditions during booking"
    ],
    rules: [
      "Always stay with the group — no solo wandering",
      "Follow coordinator instructions at all times",
      "No littering — carry your waste back",
      "No alcohol/drugs during activities",
      "Respect local culture & wildlife",
      "Keep emergency contact info handy at all times"
    ],
    weather_backup: "In case of severe weather, alternative indoor activities or rescheduling will be arranged. Full refund if trip is cancelled due to weather.",
    vehicle_breakdown: "Backup vehicle arranged within 2 hours. Coordinator will manage group comfort during wait."
  };
}

// ─── Build detailed plan for each outing ────────────────────────
const detailedPlans = {};

for (const outing of outings) {
  const loc = locationData[outing.location];
  if (!loc) {
    console.warn(`⚠ No location data for: ${outing.location}`);
    continue;
  }

  const is2d1n = outing.trip_type === '2d1n';
  const slug = outing.title.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').toLowerCase();

  detailedPlans[outing.title] = {
    trip_overview: {
      trip_name: outing.title,
      destination: outing.location,
      trip_type: is2d1n ? '2 Days / 1 Night' : '1 Day Trip',
      total_duration: is2d1n ? `~${Math.round(loc.drive_hours * 2 + 24)} hours` : `~${Math.round(loc.drive_hours * 2 + 8)} hours`,
      difficulty: loc.difficulty,
      best_season: loc.best_season,
      group_size: `Up to ${outing.max} participants`,
      departure_city: "Bangalore",
      distance: `${loc.distance_km} km (one way)`,
      altitude: loc.altitude,
      cost_per_person: `₹${outing.cost}`,
      token_amount: `₹${Math.ceil(outing.cost * 0.20)} (20% at booking)`,
      remaining_amount: `₹${outing.cost - Math.ceil(outing.cost * 0.20)} (due 24hrs before trip)`
    },
    pickup_boarding: {
      pickup_points: loc.pickup_points,
      vehicle: is2d1n ?
        (loc.distance_km > 400 ? "AC Sleeper Bus / Volvo" : "AC Tempo Traveller (12-20 seater)") :
        (outing.max > 20 ? "AC Mini Bus (25-30 seater)" : "AC Tempo Traveller (12-20 seater)"),
      boarding_process: [
        "Show digital boarding pass (QR code) on VIBES app",
        "Coordinator verifies identity with Government ID",
        "Attendance marked digitally",
        "Seat allocation & welcome kit distributed",
        "Emergency contact form verification"
      ],
      luggage: is2d1n ?
        "1 backpack + 1 small bag. Max 10kg. No hard-shell suitcases." :
        "1 daypack only. Keep it light!",
      rules: [
        "Be at pickup point 15 mins before departure",
        "Late arrivals: bus will not wait beyond 5 mins grace",
        "Wear comfortable clothes & shoes",
        "Carry your digital pass & ID proof"
      ]
    },
    itinerary: generateTimeline(outing, loc),
    transportation: {
      vehicle_type: is2d1n ?
        (loc.distance_km > 400 ? "AC Sleeper Bus / Volvo Multi-Axle" : "Force Tempo Traveller 17-seater AC") :
        (outing.max > 20 ? "AC Mini Bus 25-seater" : "Force Tempo Traveller 12-seater AC"),
      route: loc.route,
      alternate_route: loc.alt_route,
      estimated_tolls: `₹${Math.round(loc.distance_km * 0.5)} approx (included in package)`,
      fuel_buffer: "15% extra fuel allocation for detours",
      driver_details: "Professional driver with 5+ years hill/highway experience. Rest managed per Motor Vehicle Act norms.",
      emergency_backup: "Tie-up with local cab services for backup vehicle within 2 hours"
    },
    accommodation: is2d1n ? {
      type: "3-star Resort / Premium Homestay",
      room_allocation: "Twin/Triple sharing basis (couples get separate room on request)",
      check_in: "Early morning arrival — immediate access for freshening up",
      check_out: "Post breakfast Day 2",
      amenities: ["Attached washroom", "Hot water", "Clean linen", "Power backup", "Parking"],
      night_rules: "Quiet hours 11 PM – 6 AM. No outside visitors."
    } : null,
    food_plan: {
      meals: generateMealPlan(outing, loc),
      dietary: "Veg & Non-veg options at every meal. Jain/vegan — inform during booking.",
      water: "2 water bottles per person provided. Additional available at stops.",
      hygiene: "All restaurants vetted for hygiene standards by VIBES team."
    },
    activities: {
      main_activities: loc.attractions.map(a => a),
      safety_briefing: "Detailed safety briefing before every activity by trained coordinator",
      fitness_requirement: loc.difficulty.includes('Hard') ?
        "Moderate fitness required. Not recommended for heart/knee patients." :
        "Basic fitness sufficient. Comfortable walking ability needed.",
      equipment: "All activity equipment provided by organizer (unless specified in packing list)",
      guide: "Local certified guide accompanies group for all outdoor activities"
    },
    safety: generateSafety(outing, loc),
    customer_experience: {
      welcome: "Welcome kit with itinerary card, snacks, water & VIBES badge",
      icebreakers: ["Two Truths One Lie", "Travel Bingo", "Music playlist voting", "Group selfie challenge"],
      entertainment: "Curated travel playlist, Antakshari sessions, storytelling rounds",
      photography: "Group photos at all key spots. Coordinator assists with candid photography.",
      feedback: "Digital feedback form shared at trip end. ₹100 cashback for completing review on VIBES.",
      surprises: "Birthday/anniversary celebrations arranged on request (inform 3 days prior)"
    },
    budget_breakdown: generateBudget(outing, loc),
    packing_list: generatePackingList(outing, loc),
    cancellation_policy: {
      full_refund: "7+ days before trip — 100% refund of token",
      partial_refund: "3-7 days before trip — 50% refund of token",
      no_refund: "Less than 3 days — No refund (but transferable to another person)",
      weather_cancellation: "Full 100% refund if trip cancelled by VIBES due to weather/safety"
    },
    coordinator_sop: {
      pre_trip: [
        "Confirm all bookings & participant list 48 hours before",
        "Share pickup point details & coordinator contact via WhatsApp",
        "Verify vehicle condition & driver documents",
        "Pack first-aid kit, welcome kits, attendance sheets",
        "Check weather forecast & brief team"
      ],
      on_trip: [
        "Verify boarding passes & IDs at each pickup point",
        "Mark attendance digitally on VIBES admin app",
        "Conduct safety briefing before activities",
        "Ensure headcount at every transition point",
        "Handle customer issues on priority"
      ],
      post_trip: [
        "Final headcount before departure",
        "Lost item check at resort/vehicle",
        "Share feedback form & collect responses",
        "Update trip status on admin dashboard",
        "Send thank-you message & next trip promo"
      ]
    }
  };
}

// ─── Write output ───────────────────────────────────────────────
const outputPath = path.join(__dirname, 'data', 'detailed-plans.json');
fs.writeFileSync(outputPath, JSON.stringify(detailedPlans, null, 2), 'utf8');
console.log(`✅ Generated detailed plans for ${Object.keys(detailedPlans).length} outings → ${outputPath}`);
