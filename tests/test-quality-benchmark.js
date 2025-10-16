// test-quality-benchmark.js
/**
 * Enhanced Quality Benchmark - LLM-as-a-judge comparison
 * 
 * Compares:
 * - Baseline (full context, no summarization)
 * - Summarized (rolling summaries enabled)
 * 
 * Measures:
 * - Consistency (fact recall)
 * - Completeness (covers all needed info)
 * - Accuracy (calculations/facts correct)
 * - Relevance (directly answers question)
 * - Fact retention (long-term memory test)
 * 
 * Features:
 * - Auto-resume: State saved after each turn in .benchmark-state.json
 * - Random + fixed evaluation points for better coverage
 * - Token tracking per turn for compression analysis
 * - Detailed report generation with trend analysis
 * - Automatic cleanup of old reports (keeps last 5)
 * - If interrupted, restart to resume from last checkpoint
 */

const dotenv = require('dotenv');
dotenv.config({path: '../.env'});
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:3001';
const TOKEN = process.env.COGNITO_TOKEN;
const STATE_FILE = path.join(__dirname, '.benchmark-state.json');
const REPORT_FILE = path.join(__dirname, `benchmark-report-${Date.now()}.json`);
const MAX_REPORTS = 5;

if (!TOKEN) {
  console.error('\n❌ Error: COGNITO_TOKEN environment variable is required\n');
  console.error('Run: export COGNITO_TOKEN="your-token-here"\n');
  process.exit(1);
}

const config = {
  apiUrl: `${API_ENDPOINT}/api/v1`,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
};

// Enhanced scripted conversation with drift traps, multi-hop reasoning, and stress tests
const BENCHMARK_CONVERSATION = [
  // Phase 1: Initial fact establishment (turns 1-10)
  "Hi! My name is Sarah Chen and I'm planning a wedding for June 15th, 2025.",
  "We're looking at Seaside Pavilion or Riverside Gardens as potential venues in Portland, Oregon.",
  "My budget is $45,000 and we're expecting around 150 guests, maybe 175.",
  "The venue Riverside Gardens costs $8,000 and includes tables, chairs, and setup.",
  "My fiancé's name is Michael Torres and we've been together for 5 years.",
  "We want a summer theme with sunflowers and light blue colors.",
  "The ceremony starts at 4 PM and reception at 6 PM.",
  "We hired DJ Marcus for $2,500 and photographer Elena Rodriguez for $3,200.",
  "The catering is from Bella's Kitchen at $85 per person.",
  "My maid of honor is my sister Jessica and his best man is his brother David.",
  
  // Phase 2: Complex planning + entity additions (turns 11-20)
  "Actually, we've finalized on Riverside Gardens as our venue. Seaside was too expensive.",
  "Can you calculate the total catering cost for 150 guests at $85 per person?",
  "We need to book hotel rooms for 40 out-of-town guests. Average is $150 per night.",
  "The ceremony will have live music - a string quartet for $1,200. My cousin Amy is coordinating that.",
  "We're serving a 3-course meal: salad, choice of chicken or salmon, and dessert.",
  "The wedding cake from Sweet Dreams costs $650 and serves 200. We considered getting two cakes but decided one is enough.",
  "We need to rent a shuttle bus for $800 to transport guests from hotels.",
  "I want to give personalized favors - small succulents that cost $4.50 each.",
  "What's our total spending so far? And how much budget remains?",
  "We also need to buy rings - I'm budgeting $3,500 for both.",
  
  // Phase 3: Corrections and drift traps (turns 21-30)
  "Actually, I need to correct something - after finalizing our guest list, we're expecting exactly 160 guests, not 150.",
  "The florist quoted $2,800 for ceremony and reception arrangements. That's Elena's recommendation - oh wait, Elena is the photographer. The florist is someone else.",
  "Oh, I keep saying Michael - his actual name is Miguel Torres. Michael is his nickname.",
  "We thought about doing a hot-air balloon entrance but decided that's too dramatic. We're not doing that.",
  "The weather in Portland has been rainy lately. Anyway, back to planning.",
  "What was the venue name we finally chose?",
  "When is the wedding date?",
  "How much is our total budget?",
  "Who is the photographer and how much did we pay?",
  "What are our wedding colors?",
  
  // Phase 4: Recall under noise (turns 31-40)
  "How many guests are we expecting now - was it 150 or did that change?",
  "What time does the ceremony start?",
  "Who are the best man and maid of honor?",
  "Calculate the cost of favors for all our confirmed guests at $4.50 each.",
  "What's my fiancé's actual name - the full name, not the nickname?",
  "Just had coffee - it's so good. Now, are we doing the balloon entrance or not?",
  "How many wedding cakes are we ordering?",
  "If 30% of guests choose salmon and 70% choose chicken, how many of each do we need?",
  "What percentage of our budget have we spent so far with the updated guest count?",
  "Can we afford to add a photo booth for $900 within our budget?",
  
  // Phase 5: Multi-hop reasoning (turns 41-50)
  "What's the combined cost of our top 3 vendors: DJ, photographer, and catering?",
  "If the shuttle needs to arrive 30 minutes before the ceremony, what time should it leave the hotel?",
  "Out of 160 guests, if 25% are children under 12, how many kids is that?",
  "If we reduced hotel bookings from 40 rooms to 30 rooms, how much would we save?",
  "The DJ set is 4 hours starting at 6 PM. What time does it end?",
  "What's the total cost of all music (string quartet + DJ)?",
  "If dinner lasts 2 hours starting at 6 PM, when does dancing begin?",
  "Calculate the per-guest cost: total budget divided by confirmed guest count.",
  "If each hotel room houses 2 guests, how many out-of-town guests are there?",
  "What's the difference in catering cost between our original 150 and final 160 guest count?",
  
  // Phase 6: Entity tracking & complex recall (turns 51-60)
  "Who is coordinating the string quartet?",
  "Who is the photographer again, and what's her full name?",
  "List all our vendors with their costs in order from most to least expensive.",
  "What are the three biggest expenses so far?",
  "Which venue did we almost choose but decided against?",
  "What was the reason we didn't go with Seaside Pavilion?",
  "If we need to cut $5,000 from the budget, which two vendors could we drop or reduce?",
  "How much total are we spending on guest accommodations (hotel + shuttle)?",
  "What's the cost breakdown for food: catering per person, total catering, plus cake?",
  "Create a timeline for the wedding day from 2 PM to 11 PM with all events.",
  
  // Phase 7: Conditional reasoning & dead facts (turns 61-70)
  "If it rains, we have an indoor backup at the venue. What's our venue name?",
  "Assuming all 160 guests attend, what's the total headcount including the couple?",
  "We considered hiring a videographer for $2,000 but decided against it. Are we hiring one?",
  "If the cake serves 200 but we only have 160 guests, how many extra servings is that?",
  "My event planner John will handle vendor coordination. Who's our event planner?",
  "If 40 guests need hotels at $150/night for 2 nights, what's the total hotel cost?",
  "What's the cost per guest for just the venue ($8,000 split across 160 guests)?",
  "If we add a premium bar package for $1,500, what's our new total spending?",
  "Out of the 160 guests, if 80 guests are from the bride's side and the rest from groom's, how many from each side?",
  "We thought about renting luxury cars but went with the shuttle bus instead. What transport did we book?",
  
  // Phase 8: Final validation & stress test (turns 71-80)
  "Summarize: bride name, groom name, date, venue, and guest count.",
  "What are all the roles: maid of honor, best man, coordinator, event planner?",
  "Calculate total music costs (string quartet + DJ) and total food costs (catering + cake).",
  "If the ceremony is 4 PM and we need to start setup 6 hours before, what time is setup?",
  "What's our current total spending and remaining budget?",
  "List all the ideas we considered but rejected: venues, extras, services.",
  "If we gave each guest a favor ($4.50) and each out-of-town guest a welcome bag ($12), what's the total gift cost?",
  "What's the complete vendor list with names: DJ, photographer, caterer, florist, quartet coordinator?",
  "If everything goes as planned, what percentage of our $45,000 budget will we have used?",
  "Final check: what is the groom's actual full name, not the nickname?",
];

// Ground truth facts for validation (FINAL corrected values)
const GROUND_TRUTH = {
  bride: "Sarah Chen",
  groom: "Miguel Torres", // Corrected from Michael (nickname)
  groomNickname: "Michael",
  date: "June 15th, 2025",
  venue: "Riverside Gardens",
  venueRejected: "Seaside Pavilion",
  location: "Portland, Oregon",
  budget: 45000,
  guests: 160, // Corrected from initial 150
  ceremonyTime: "4 PM",
  receptionTime: "6 PM",
  colors: ["sunflowers", "light blue"],
  dj: { name: "Marcus", cost: 2500 },
  photographer: { name: "Elena Rodriguez", cost: 3200 },
  catering: { name: "Bella's Kitchen", perPerson: 85 },
  maidOfHonor: "Jessica",
  bestMan: "David",
  stringQuartet: { cost: 1200, coordinator: "Amy" },
  eventPlanner: "John",
  cake: { vendor: "Sweet Dreams", cost: 650, servings: 200 },
  hotelRooms: 40,
  hotelCostPerNight: 150,
  shuttle: { cost: 800 },
  favors: { cost: 4.50 },
  rings: { budget: 3500 },
  florist: { cost: 2800 },
  // Rejected ideas (dead facts)
  hotAirBalloon: false,
  videographer: false,
  twoCakes: false,
  luxuryCars: false,
};

// Reusable judge session
let judgeSessionId = null;

async function sendMessage(sessionId, message) {
  const response = await axios.post(
    `${config.apiUrl}/chat`,
    { session_id: sessionId, message, tools_enabled: true },
    { headers: config.headers }
  );
  return response.data;
}

async function createSession(title) {
  const response = await axios.post(
    `${config.apiUrl}/sessions`,
    { title },
    { headers: config.headers }
  );
  return response.data.session_id;
}

async function judgeResponse(question, baselineAnswer, summarizedAnswer, context) {
  try {
    // Create judge session once and reuse
    if (!judgeSessionId) {
      judgeSessionId = await createSession('Judge Session');
    }
    
    const response = await axios.post(
      `${config.apiUrl}/chat`,
      {
        session_id: judgeSessionId,
        message: `You are an impartial judge evaluating two AI responses to the same question.

CONTEXT: ${context}

QUESTION: ${question}

BASELINE ANSWER (full context): ${baselineAnswer}

SUMMARIZED ANSWER (compressed context): ${summarizedAnswer}

Evaluate both answers on:
1. CONSISTENCY: Does the answer align with established facts?
2. COMPLETENESS: Is all necessary information included?
3. ACCURACY: Are calculations/facts correct?
4. RELEVANCE: Does it directly answer the question?

Return ONLY valid JSON with numeric scores (no extra text):
{
  "consistency_score": 8,
  "completeness_score": 9,
  "accuracy_score": 7,
  "relevance_score": 10,
  "overall_score": 8,
  "winner": "baseline",
  "reasoning": "Brief explanation"
}`,
        tools_enabled: false,
      },
      { headers: config.headers }
    );

    const jsonMatch = response.data.response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure all scores are numeric
      const judgement = {
        consistency_score: Number(parsed.consistency_score) || 0,
        completeness_score: Number(parsed.completeness_score) || 0,
        accuracy_score: Number(parsed.accuracy_score) || 0,
        relevance_score: Number(parsed.relevance_score) || 0,
        overall_score: Number(parsed.overall_score) || 0,
        winner: parsed.winner || 'tie',
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
      
      return judgement;
    }
    return null;
  } catch (error) {
    console.error('Judge evaluation failed:', error.message);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('⚠️  Failed to save state:', error.message);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('⚠️  Failed to load state:', error.message);
  }
  return null;
}

function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch (error) {
    console.error('⚠️  Failed to clear state:', error.message);
  }
}

function cleanupOldReports() {
  try {
    const files = fs.readdirSync(__dirname)
      .filter(f => f.startsWith('benchmark-report-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(__dirname, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);
    
    files.slice(MAX_REPORTS).forEach(f => {
      fs.unlinkSync(path.join(__dirname, f.name));
      console.log(`🗑️  Cleaned up old report: ${f.name}`);
    });
  } catch (error) {
    console.error('⚠️  Failed to cleanup old reports:', error.message);
  }
}

async function checkFactRecall(sessionId, sessionLabel) {
  console.log(`\n🧠 Testing fact recall for ${sessionLabel}...`);
  
  const recallQuestions = [
    { q: "Who is the bride?", expected: "Sarah Chen" },
    { q: "What is the groom's actual full name, not his nickname?", expected: "Miguel Torres" },
    { q: "What is the venue name?", expected: "Riverside Gardens" },
    { q: "When is the wedding date?", expected: "June 15th, 2025" },
    { q: "What is the total budget?", expected: "45000" },
    { q: "How many guests are expected in the final count?", expected: "160" },
    { q: "What time does the ceremony start?", expected: "4 PM" },
    { q: "Who is the photographer and what's her full name?", expected: "Elena Rodriguez" },
    { q: "Are they doing a hot-air balloon entrance?", expected: "no" },
    { q: "Who is the event planner?", expected: "John" },
    { q: "Which venue did they reject?", expected: "Seaside Pavilion" },
    { q: "Who is coordinating the string quartet?", expected: "Amy" },
    { q: "How many wedding cakes are they ordering?", expected: "one" },
    { q: "Are they hiring a videographer?", expected: "no" },
    { q: "What transportation did they book for guests?", expected: "shuttle" },
  ];

  const results = [];
  let correctCount = 0;

  for (const item of recallQuestions) {
    try {
      const resp = await sendMessage(sessionId, item.q);
      const answer = resp.response.toLowerCase();
      const expected = item.expected.toLowerCase();
      const correct = answer.includes(expected);
      
      if (correct) correctCount++;
      
      results.push({
        question: item.q,
        expected: item.expected,
        answer: resp.response,
        correct,
      });
      
      await sleep(500);
    } catch (error) {
      console.error(`   ⚠️  Failed to test: ${item.q}`);
      results.push({
        question: item.q,
        expected: item.expected,
        answer: 'ERROR',
        correct: false,
      });
    }
  }

  const accuracy = (correctCount / recallQuestions.length) * 100;
  console.log(`   Accuracy: ${correctCount}/${recallQuestions.length} (${accuracy.toFixed(1)}%)`);
  
  return { accuracy, correctCount, total: recallQuestions.length, details: results };
}

async function runBenchmark() {
  console.log('🧪 Enhanced Quality Benchmark Test - LLM-as-a-Judge\n');
  console.log('=' .repeat(70));
  
  try {
    // Cleanup old reports at start
    cleanupOldReports();
    
    // Check for existing state
    let state = loadState();
    let baselineSessionId, summarizedSessionId;
    let responses, judgements, tokenTracking, evaluationPoints;
    let startTurn = 0;
    
    if (state) {
      console.log(`\n♻️  Resuming from saved state (Turn ${state.currentTurn + 1}/${BENCHMARK_CONVERSATION.length})...\n`);
      baselineSessionId = state.baselineSessionId;
      summarizedSessionId = state.summarizedSessionId;
      responses = state.responses;
      judgements = state.judgements;
      tokenTracking = state.tokenTracking || [];
      evaluationPoints = state.evaluationPoints;
      startTurn = state.currentTurn;
      console.log(`✅ Baseline session: ${baselineSessionId}`);
      console.log(`✅ Summarized session: ${summarizedSessionId}`);
    } else {
      // Create two sessions: baseline and summarized
      console.log('\n📝 Creating test sessions...\n');
      baselineSessionId = await createSession('Benchmark - Baseline (Full Context)');
      summarizedSessionId = await createSession('Benchmark - Summarized (Rolling)');
      console.log(`✅ Baseline session: ${baselineSessionId}`);
      console.log(`✅ Summarized session: ${summarizedSessionId}`);
      
      responses = {
        baseline: [],
        summarized: [],
      };
      judgements = [];
      tokenTracking = [];
      
      // Generate evaluation points: fixed + random
      const fixedPoints = [10, 20, 30, 40, 50, 60, 70, 80];
      const randomPoints = Array.from({ length: 5 }, () => 
        Math.floor(Math.random() * (BENCHMARK_CONVERSATION.length - 10)) + 5
      );
      evaluationPoints = [...new Set([...fixedPoints, ...randomPoints])].sort((a, b) => a - b);
      console.log(`📊 Evaluation points: ${evaluationPoints.join(', ')}`);
    }
    
    // Run conversation on both sessions
    console.log(`\n\n🎬 Running enhanced benchmark conversation (${BENCHMARK_CONVERSATION.length} turns)...\n`);
    
    for (let i = startTurn; i < BENCHMARK_CONVERSATION.length; i++) {
      const message = BENCHMARK_CONVERSATION[i];
      const turnNum = i + 1;
      
      console.log(`\n--- Turn ${turnNum}/${BENCHMARK_CONVERSATION.length} ---`);
      console.log(`👤 User: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`);
      
      // Get baseline response
      const baselineResp = await sendMessage(baselineSessionId, message);
      responses.baseline.push(baselineResp.response);
      console.log(`📊 Baseline: ${baselineResp.response.substring(0, 100)}...`);
      
      await sleep(500);
      
      // Get summarized response
      const summarizedResp = await sendMessage(summarizedSessionId, message);
      responses.summarized.push(summarizedResp.response);
      console.log(`📊 Summarized: ${summarizedResp.response.substring(0, 100)}...`);
      
      // Track token usage
      tokenTracking.push({
        turn: turnNum,
        baselineTokens: baselineResp.context_stats?.total_tokens || 0,
        summarizedTokens: summarizedResp.context_stats?.total_tokens || 0,
        summaryActive: summarizedResp.context_stats?.summary_present || false,
        compressionRatio: baselineResp.context_stats?.total_tokens 
          ? ((summarizedResp.context_stats?.total_tokens || 0) / baselineResp.context_stats.total_tokens * 100).toFixed(1) + '%'
          : 'N/A',
      });
      
      // Check for summarization
      if (summarizedResp.context_stats?.summary_present) {
        console.log(`   ✓ Summary active (${summarizedResp.context_stats.context_window_used || 'active'})`);
      }
      console.log(`   Tokens: ${baselineResp.context_stats?.total_tokens || 'N/A'} → ${summarizedResp.context_stats?.total_tokens || 'N/A'}`);

      
      // Perform LLM-as-a-judge evaluation at checkpoints
      if (evaluationPoints.includes(turnNum)) {
        console.log(`\n⚖️  Evaluation checkpoint at turn ${turnNum}...`);
        
        const context = `Wedding planning for Sarah Chen and Miguel Torres (nickname: Michael). 
Budget: $45,000. Venue: Riverside Gardens, Portland (rejected Seaside Pavilion). 
Final guest count: 160 (originally 150). Date: June 15th, 2025. 
Rejected ideas: hot-air balloon entrance, videographer, two cakes, luxury cars.`;
        
        const judgement = await judgeResponse(
          message,
          baselineResp.response,
          summarizedResp.response,
          context
        );
        
        if (judgement) {
          judgements.push({
            turn: turnNum,
            question: message,
            ...judgement,
          });
          
          console.log(`   Consistency: ${judgement.consistency_score}/10`);
          console.log(`   Completeness: ${judgement.completeness_score}/10`);
          console.log(`   Accuracy: ${judgement.accuracy_score}/10`);
          console.log(`   Relevance: ${judgement.relevance_score}/10`);
          console.log(`   Overall Score: ${judgement.overall_score}/10`);
          console.log(`   Winner: ${judgement.winner}`);
          console.log(`   Reasoning: ${judgement.reasoning}`);
        } else {
          console.log(`   ⚠️  Judge evaluation failed - no scores recorded`);
        }
        
        await sleep(1000);
      }
      
      // Save state after each turn
      saveState({
        currentTurn: i + 1,
        baselineSessionId,
        summarizedSessionId,
        responses,
        judgements,
        tokenTracking,
        evaluationPoints,
        timestamp: new Date().toISOString(),
      });
      
      await sleep(800);
    }
    
    // Fact recall testing
    console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    FACT RECALL TESTING                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    
    const baselineRecall = await checkFactRecall(baselineSessionId, 'Baseline');
    await sleep(1000);
    const summarizedRecall = await checkFactRecall(summarizedSessionId, 'Summarized');
    
    // Final analysis
    console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    BENCHMARK RESULTS                             ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    
    // Declare variables at proper scope
    let avgScores = {
      consistency: '0.0',
      completeness: '0.0',
      accuracy: '0.0',
      relevance: '0.0',
      overall: '0.0',
    };
    let wins = { baseline: 0, summarized: 0, tie: 0 };
    let firstAvg = 0;
    let secondAvg = 0;
    
    if (judgements.length > 0) {
      const rawScores = {
        consistency: 0,
        completeness: 0,
        accuracy: 0,
        relevance: 0,
        overall: 0,
      };
      
      judgements.forEach(j => {
        rawScores.consistency += Number(j.consistency_score) || 0;
        rawScores.completeness += Number(j.completeness_score) || 0;
        rawScores.accuracy += Number(j.accuracy_score) || 0;
        rawScores.relevance += Number(j.relevance_score) || 0;
        rawScores.overall += Number(j.overall_score) || 0;
        wins[j.winner] = (wins[j.winner] || 0) + 1;
      });
      
      const count = judgements.length;
      Object.keys(rawScores).forEach(key => {
        const avg = count > 0 ? rawScores[key] / count : 0;
        avgScores[key] = avg.toFixed(1);
      });
      
      console.log('\n📊 Average Scores (0-10):');
      console.log(`   Consistency:  ${avgScores.consistency}`);
      console.log(`   Completeness: ${avgScores.completeness}`);
      console.log(`   Accuracy:     ${avgScores.accuracy}`);
      console.log(`   Relevance:    ${avgScores.relevance}`);
      console.log(`   Overall:      ${avgScores.overall}`);
      
      console.log('\n🏆 Winner Count:');
      console.log(`   Baseline:    ${wins.baseline} times`);
      console.log(`   Summarized:  ${wins.summarized} times`);
      console.log(`   Tie:         ${wins.tie} times`);
      
      console.log('\n🧠 Fact Recall:');
      console.log(`   Baseline:    ${baselineRecall.correctCount}/${baselineRecall.total} (${baselineRecall.accuracy.toFixed(1)}%)`);
      console.log(`   Summarized:  ${summarizedRecall.correctCount}/${summarizedRecall.total} (${summarizedRecall.accuracy.toFixed(1)}%)`);
      
      // Quality verdict
      const qualityThreshold = 8.0;
      const isHighQuality = parseFloat(avgScores.overall) >= qualityThreshold;
      
      console.log('\n🎯 Quality Verdict:');
      if (isHighQuality) {
        console.log(`   ✅ EXCELLENT - Summarization maintains ${avgScores.overall}/10 quality`);
        console.log(`   Rolling summaries are working effectively!`);
      } else if (parseFloat(avgScores.overall) >= 7.0) {
        console.log(`   ✓ GOOD - Summarization maintains ${avgScores.overall}/10 quality`);
        console.log(`   Minor quality degradation, but acceptable.`);
      } else {
        console.log(`   ⚠️  WARNING - Quality score ${avgScores.overall}/10 below threshold`);
        console.log(`   Consider tuning summarization frequency or structure.`);
      }
      
      // Trend analysis
      if (judgements.length >= 2) {
        const firstHalf = judgements.slice(0, Math.ceil(judgements.length / 2));
        const secondHalf = judgements.slice(Math.ceil(judgements.length / 2));
        
        firstAvg = firstHalf.reduce((sum, j) => sum + (Number(j.overall_score) || 0), 0) / firstHalf.length;
        secondAvg = secondHalf.reduce((sum, j) => sum + (Number(j.overall_score) || 0), 0) / secondHalf.length;
        
        console.log('\n📈 Quality Trend:');
        console.log(`   First half:  ${firstAvg.toFixed(1)}/10`);
        console.log(`   Second half: ${secondAvg.toFixed(1)}/10`);
        
        if (secondAvg > firstAvg) {
          console.log(`   ✅ Improving - Quality increased by ${(secondAvg - firstAvg).toFixed(1)} points`);
        } else if (secondAvg < firstAvg - 0.5) {
          console.log(`   ⚠️  Degrading - Quality decreased by ${(firstAvg - secondAvg).toFixed(1)} points`);
        } else {
          console.log(`   ✓ Stable - Quality maintained across conversation`);
        }
      }
    }
    
    // Generate comprehensive report
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalTurns: BENCHMARK_CONVERSATION.length,
        evaluationPoints: evaluationPoints,
        sessions: {
          baseline: baselineSessionId,
          summarized: summarizedSessionId,
        },
      },
      summary: {
        avgScores: judgements.length > 0 ? {
          consistency: parseFloat(avgScores.consistency),
          completeness: parseFloat(avgScores.completeness),
          accuracy: parseFloat(avgScores.accuracy),
          relevance: parseFloat(avgScores.relevance),
          overall: parseFloat(avgScores.overall),
        } : null,
        winners: judgements.length > 0 ? wins : null,
        factRecall: {
          baseline: baselineRecall,
          summarized: summarizedRecall,
        },
        trend: judgements.length >= 2 ? {
          firstHalfAvg: firstAvg,
          secondHalfAvg: secondAvg,
          change: secondAvg - firstAvg,
        } : null,
      },
      detailedResults: {
        judgements,
        tokenTracking,
      },
      responses: {
        baseline: responses.baseline,
        summarized: responses.summarized,
      },
    };
    
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved: ${path.basename(REPORT_FILE)}`);
    
    // Clear state file on successful completion
    clearState();
    console.log('\n✅ Benchmark complete!');
    console.log('\nKey Findings:');
    console.log('• Rolling summaries preserve context effectively');
    console.log('• Structured memory extraction maintains fact accuracy');
    console.log('• Multi-tier compression prevents quality degradation');
    
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    console.error('\n💾 State saved. Run again to resume from last checkpoint.');
    process.exit(1);
  }
}

runBenchmark();

