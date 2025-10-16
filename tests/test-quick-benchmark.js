// test-quick-benchmark.js
/**
 * Quick Quality Benchmark - Fast validation (5-10 min runtime)
 * 
 * Reduced version for rapid testing:
 * - 20 turns instead of 80
 * - 3 evaluation points instead of 13
 * - Simplified fact recall (5 tests instead of 15)
 * 
 * Use this for:
 * - Quick validation after code changes
 * - CI/CD pipeline integration
 * - Rapid iteration during development
 */

const dotenv = require('dotenv');
dotenv.config({path: '../.env'});
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:3001';
const TOKEN = process.env.COGNITO_TOKEN;
const REPORT_FILE = path.join(__dirname, `quick-benchmark-${Date.now()}.json`);

if (!TOKEN) {
  console.error('\n❌ Error: COGNITO_TOKEN environment variable is required\n');
  process.exit(1);
}

const config = {
  apiUrl: `${API_ENDPOINT}/api/v1`,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
};

// Condensed conversation (20 turns)
const QUICK_CONVERSATION = [
  // Phase 1: Setup (5 turns)
  "Hi! I'm Sarah Chen planning a wedding for June 15th, 2025 in Portland with budget $45,000.",
  "We chose Riverside Gardens venue ($8,000) for 150 guests, with DJ Marcus ($2,500) and photographer Elena Rodriguez ($3,200).",
  "Catering from Bella's Kitchen at $85 per person, and string quartet for $1,200.",
  "My fiancé is Michael Torres, maid of honor is Jessica, best man is David.",
  "Wedding colors are sunflowers and light blue, ceremony at 4 PM, reception at 6 PM.",
  
  // Phase 2: Changes (5 turns)
  "Actually, guest count changed to 160 (not 150), and Michael's actual name is Miguel Torres.",
  "We considered hot-air balloon entrance but decided against it. Also not hiring a videographer.",
  "What's the venue name we chose?",
  "Calculate total catering cost for 160 guests at $85 per person.",
  "What's my fiancé's actual full name?",
  
  // Phase 3: Calculations (5 turns)
  "What's our total spending so far with all vendors?",
  "If we add favors at $4.50 per guest for 160 guests, what's the cost?",
  "Are we doing the hot-air balloon entrance?",
  "Who is the photographer and what's her full name?",
  "If 30% choose salmon and 70% chicken, how many of each for 160 guests?",
  
  // Phase 4: Final validation (5 turns)
  "Summarize: bride name, groom name, date, venue, guest count.",
  "What are our wedding colors?",
  "When does the ceremony start?",
  "List the top 3 most expensive vendors with costs.",
  "What's the groom's actual full name (not nickname)?",
];

const GROUND_TRUTH = {
  bride: "Sarah Chen",
  groom: "Miguel Torres",
  venue: "Riverside Gardens",
  guests: 160,
  budget: 45000,
  colors: ["sunflowers", "light blue"],
  ceremonyTime: "4 PM",
  photographer: "Elena Rodriguez",
  hotAirBalloon: false,
  videographer: false,
};

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

async function judgeResponse(question, baselineAnswer, summarizedAnswer) {
  try {
    if (!judgeSessionId) {
      judgeSessionId = await createSession('Judge Session - Quick');
    }
    
    const response = await axios.post(
      `${config.apiUrl}/chat`,
      {
        session_id: judgeSessionId,
        message: `Compare these two AI responses. Return ONLY valid JSON:

QUESTION: ${question}

BASELINE: ${baselineAnswer}

SUMMARIZED: ${summarizedAnswer}

{
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
      return {
        overall_score: Number(parsed.overall_score) || 0,
        winner: parsed.winner || 'tie',
        reasoning: parsed.reasoning || 'No reasoning',
      };
    }
    return null;
  } catch (error) {
    console.error('Judge failed:', error.message);
    return null;
  }
}

async function checkFactRecall(sessionId, sessionLabel) {
  console.log(`\n🧠 Fact recall: ${sessionLabel}...`);
  
  const questions = [
    { q: "Who is the bride?", expected: "Sarah Chen" },
    { q: "What's the groom's actual name (not nickname)?", expected: "Miguel Torres" },
    { q: "What's the venue?", expected: "Riverside Gardens" },
    { q: "Final guest count?", expected: "160" },
    { q: "Are they doing hot-air balloon entrance?", expected: "no" },
  ];

  let correct = 0;
  for (const item of questions) {
    try {
      const resp = await sendMessage(sessionId, item.q);
      if (resp.response.toLowerCase().includes(item.expected.toLowerCase())) {
        correct++;
      }
      await sleep(300);
    } catch (error) {
      console.error(`   Failed: ${item.q}`);
    }
  }

  const accuracy = (correct / questions.length) * 100;
  console.log(`   ${correct}/${questions.length} (${accuracy.toFixed(1)}%)`);
  return { correct, total: questions.length, accuracy };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runQuickBenchmark() {
  console.log('⚡ Quick Quality Benchmark - Fast Validation\n');
  console.log('='.repeat(60));
  
  try {
    // Create sessions
    console.log('\n📝 Creating sessions...\n');
    const baselineSessionId = await createSession('Quick Benchmark - Baseline');
    const summarizedSessionId = await createSession('Quick Benchmark - Summarized');
    console.log(`✅ Baseline: ${baselineSessionId}`);
    console.log(`✅ Summarized: ${summarizedSessionId}`);
    
    const responses = { baseline: [], summarized: [] };
    const judgements = [];
    const evaluationPoints = [7, 13, 20]; // Evaluate at 3 points
    
    // Run conversation
    console.log(`\n\n🎬 Running ${QUICK_CONVERSATION.length} turns...\n`);
    
    for (let i = 0; i < QUICK_CONVERSATION.length; i++) {
      const message = QUICK_CONVERSATION[i];
      const turnNum = i + 1;
      
      console.log(`\n[${turnNum}/${QUICK_CONVERSATION.length}] ${message.substring(0, 60)}...`);
      
      // Baseline
      const baselineResp = await sendMessage(baselineSessionId, message);
      responses.baseline.push(baselineResp.response);
      
      await sleep(400);
      
      // Summarized
      const summarizedResp = await sendMessage(summarizedSessionId, message);
      responses.summarized.push(summarizedResp.response);
      
      // Token tracking
      if (summarizedResp.context_stats?.summary_present) {
        console.log(`   ✓ Summary active`);
      }
      console.log(`   Tokens: ${baselineResp.context_stats?.total_tokens || '?'} → ${summarizedResp.context_stats?.total_tokens || '?'}`);
      
      // Evaluate at checkpoints
      if (evaluationPoints.includes(turnNum)) {
        console.log(`   ⚖️  Evaluating...`);
        const judgement = await judgeResponse(
          message,
          baselineResp.response,
          summarizedResp.response
        );
        
        if (judgement) {
          judgements.push({ turn: turnNum, ...judgement });
          console.log(`   Score: ${judgement.overall_score}/10 | Winner: ${judgement.winner}`);
        }
        await sleep(500);
      }
      
      await sleep(600);
    }
    
    // Fact recall
    console.log('\n\n' + '='.repeat(60));
    console.log('FACT RECALL TESTING');
    console.log('='.repeat(60));
    
    const baselineRecall = await checkFactRecall(baselineSessionId, 'Baseline');
    await sleep(500);
    const summarizedRecall = await checkFactRecall(summarizedSessionId, 'Summarized');
    
    // Results
    console.log('\n\n' + '='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    
    let avgScore = 0;
    let wins = { baseline: 0, summarized: 0, tie: 0 };
    
    if (judgements.length > 0) {
      avgScore = judgements.reduce((sum, j) => sum + (Number(j.overall_score) || 0), 0) / judgements.length;
      judgements.forEach(j => {
        wins[j.winner] = (wins[j.winner] || 0) + 1;
      });
      
      console.log(`\n📊 Average Score: ${avgScore.toFixed(1)}/10`);
      console.log(`🏆 Winners: Baseline ${wins.baseline} | Summarized ${wins.summarized} | Tie ${wins.tie}`);
    }
    
    console.log(`\n🧠 Fact Recall:`);
    console.log(`   Baseline:    ${baselineRecall.correct}/${baselineRecall.total} (${baselineRecall.accuracy.toFixed(1)}%)`);
    console.log(`   Summarized:  ${summarizedRecall.correct}/${summarizedRecall.total} (${summarizedRecall.accuracy.toFixed(1)}%)`);
    
    // Verdict
    console.log('\n🎯 Verdict:');
    if (avgScore >= 8.0 && summarizedRecall.accuracy >= 80) {
      console.log('   ✅ PASS - Summarization quality maintained');
    } else if (avgScore >= 7.0 && summarizedRecall.accuracy >= 60) {
      console.log('   ✓ ACCEPTABLE - Minor degradation');
    } else {
      console.log('   ⚠️  NEEDS REVIEW - Quality concerns');
    }
    
    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        avgScore: avgScore.toFixed(1),
        winners: wins,
        factRecall: { baseline: baselineRecall, summarized: summarizedRecall },
      },
      judgements,
      responses,
    };
    
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report: ${path.basename(REPORT_FILE)}`);
    console.log('\n✅ Quick benchmark complete!\n');
    
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error.message);
    process.exit(1);
  }
}

runQuickBenchmark();

