# 🎙️ Voice AI Company Platform - Multi-Tenant SaaS for Business Voice Automation

A production-grade **multi-tenant SaaS platform** that provides voice AI agents for businesses. Handle multiple businesses, concurrent calls, bidirectional calling, and comprehensive admin management - all from one platform.

## ✨ Enterprise Features

### 🏢 **Multi-Tenant SaaS Platform**
- **Multiple Businesses** - Serve hundreds of clients from one platform
- **Concurrent Call Handling** - Unlimited simultaneous calls across all businesses
- **Business-Specific Configuration** - Custom prompts, voices, and workflows per client
- **Industry Templates** - Pre-built configurations for restaurants, healthcare, real estate, etc.
- **Usage Tracking & Billing** - Monitor calls, minutes, and success metrics per business

### 📞 **Advanced Calling Features**
- **Bidirectional Calling** - Both inbound (customers call business) and outbound (business calls customers)
- **Multi-Number Support** - Each business can have multiple phone numbers
- **Real-Time Call Routing** - Intelligent routing based on phone number and business rules
- **Call Queuing & Load Balancing** - Handle high call volumes efficiently
- **Live Call Monitoring** - Real-time dashboard showing all active conversations

### 🎯 **Voice AI Capabilities**
- **🧠 Intent-Based Agents** - Lead capture, booking, support, and sales specialists
- **🎯 Smart Conversation Flow** - Context-aware responses with policy overrides
- **📊 CRM Automation** - HubSpot, Airtable, Salesforce integration per business
- **🎵 Multi-STT Support** - OpenAI Whisper and Deepgram integration
- **🗣️ High-Quality TTS** - ElevenLabs with voice customization per business
- **🧪 Local Testing** - Complete call simulator with no paid services required
- **📈 Real-time Analytics** - Session tracking and conversation insights
- **🔒 Enterprise Security** - Multi-tenant data isolation and compliance

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- API keys for desired services (see configuration below)

### Installation

```bash
# Clone and install
git clone <repository-url>
cd voice-agent
pnpm install

# Set up environment
cp env.example .env
# Edit .env with your API keys
```

### Development

```bash
# Start development server
pnpm dev

# Test with local simulator (no external services needed)
pnpm call:simulate --script=lead-capture

# Run tests
pnpm test

# Check code quality
pnpm lint
```

## 📋 Configuration

### Required Environment Variables

Create a `.env` file from `env.example`:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000

# Speech-to-Text (choose one)
STT_PROVIDER=whisper          # whisper | deepgram
OPENAI_API_KEY=your_openai_key
DEEPGRAM_API_KEY=your_deepgram_key

# Text-to-Speech
ELEVEN_API_KEY=your_elevenlabs_key
ELEVEN_VOICE_ID=your_voice_id

# CRM Integration
HUBSPOT_PRIVATE_APP_TOKEN=your_hubspot_token
AIRTABLE_API_KEY=your_airtable_key
AIRTABLE_BASE_ID=your_base_id

# Vapi Integration
VAPI_API_KEY=your_vapi_key
VAPI_WEBHOOK_SECRET=your_webhook_secret

# Optional: Outbound Calling
VAPI_OUTBOUND_ENABLED=false
VAPI_ASSISTANT_ID=your_assistant_id
VAPI_CALLER_NUMBER=+1234567890
VAPI_CALLEE_NUMBER=+1234567890
```

### Service Configuration

#### STT Providers
- **Whisper**: Best for accuracy, REST API only
- **Deepgram**: Real-time streaming, lower latency

#### TTS Options
- **ElevenLabs**: Premium quality, natural voices
- **Fallback**: Mock TTS for development/testing

#### CRM Integration
- **HubSpot**: Contact and deal management
- **Airtable**: Reservation and menu data storage

## 📞 Advanced Calling Features

### 🏢 **Multi-Business Setup**

Set up multiple businesses with different phone numbers and configurations:

```bash
# Quick setup for a restaurant
curl -X POST http://localhost:3000/api/quick-setup \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Mario'\''s Restaurant",
    "industry": "restaurant",
    "phoneNumber": "+1234567890",
    "vapiAssistantId": "your-vapi-assistant-id"
  }'

# Quick setup for a medical practice
curl -X POST http://localhost:3000/api/quick-setup \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Sunny Medical Center", 
    "industry": "healthcare",
    "phoneNumber": "+1987654321",
    "vapiAssistantId": "your-other-assistant-id"
  }'
```

### 📞 **Bidirectional Calling**

#### **Inbound Calls (Customers → Business)**
1. **Configure Vapi Assistants** with different phone numbers
2. **Set webhook URL**: `https://your-ngrok-url.ngrok.io/vapi/events`
3. **Customers call** business phone numbers
4. **AI routes** to correct business configuration

#### **Outbound Calls (Business → Customers)**

**Method 1: Admin Dashboard**
- Go to `http://localhost:3000/admin/admin.html`
- Enter customer phone number
- Click "📞 Call Now"

**Method 2: API Call**
```bash
# Call a customer for a specific business
curl -X POST http://localhost:3000/api/businesses/BUSINESS_ID/calls \
  -H "Content-Type: application/json" \
  -d '{
    "customerPhone": "+1555123456",
    "message": "Follow up on restaurant inquiry"
  }'
```

**Method 3: Direct Outbound Test**
```bash
# Configure outbound in .env
VAPI_OUTBOUND_ENABLED=true
VAPI_ASSISTANT_ID=your-assistant-id
VAPI_CALLER_NUMBER=+1234567890  # Your Vapi number
VAPI_CALLEE_NUMBER=+1555123456  # Your real phone number

# Test call yourself
npm run call:outbound -- test
```

### 🔄 **Concurrent Call Handling**

**Test Multiple Simultaneous Calls:**
1. **Set up multiple businesses** with different phone numbers
2. **Call all numbers simultaneously** from different phones
3. **Watch the admin dashboard** show multiple active calls
4. **Each call is handled independently** with isolated state

**Monitor Concurrent Performance:**
```bash
# View real-time stats
curl http://localhost:3000/admin/dashboard

# Example response:
{
  "stats": {
    "concurrent": 5,    # 5 calls happening right now
    "total": 47,        # Total sessions today
    "byIntent": {
      "lead": 2,        # 2 lead capture calls active
      "booking": 3      # 3 booking calls active
    }
  }
}
```

### 📊 **Live Call Monitoring**

**Admin Dashboard:** `http://localhost:3000/admin/admin.html`
- **🔴 Active Calls**: See all ongoing conversations
- **📈 Real-Time Stats**: Concurrent calls, success rates, duration
- **🏢 Business Overview**: Performance per business client
- **📞 Manual Calling**: Initiate calls to any number
- **📋 Call History**: Complete logs with transcripts

**API Monitoring:**
```bash
# Get platform-wide statistics
curl http://localhost:3000/api/platform/stats

# Get specific business performance
curl http://localhost:3000/api/businesses/BUSINESS_ID

# View call logs with filtering
curl "http://localhost:3000/admin/logs?status=active&intent=booking"

# Get analytics with timeframe
curl "http://localhost:3000/admin/analytics?timeframe=24h"
```

## 🧪 Testing Scenarios

### **Scenario 1: Test Your Real Phone Number**

```bash
# 1. Set up outbound calling to call yourself
VAPI_OUTBOUND_ENABLED=true
VAPI_ASSISTANT_ID=your-assistant-id
VAPI_CALLER_NUMBER=+1234567890  # Your Vapi business number
VAPI_CALLEE_NUMBER=+1555123456  # Your real personal phone

# 2. Test the call
npm run call:outbound -- test

# 3. Your phone will ring and you can talk to your AI!
```

### **Scenario 2: Multiple Business Testing**

```bash
# 1. Create multiple businesses
curl -X POST http://localhost:3000/api/quick-setup -H "Content-Type: application/json" -d '{"businessName": "Restaurant A", "industry": "restaurant", "phoneNumber": "+1111111111"}'

curl -X POST http://localhost:3000/api/quick-setup -H "Content-Type: application/json" -d '{"businessName": "Medical B", "industry": "healthcare", "phoneNumber": "+2222222222"}'

# 2. Configure Vapi assistants for each number
# 3. Call both numbers simultaneously from different phones
# 4. Watch concurrent calls in admin dashboard
```

### **Scenario 3: Business-to-Customer Outreach**

```bash
# 1. Get business ID
curl http://localhost:3000/api/businesses

# 2. Call a customer on behalf of a business
curl -X POST http://localhost:3000/api/businesses/BUSINESS_ID/calls \
  -H "Content-Type: application/json" \
  -d '{"customerPhone": "+1555123456", "message": "Follow up call"}'

# 3. Customer receives call from business AI agent
```

## 🏗️ Architecture

### Intent-Based Agent System

```
📞 Incoming Call
    ↓
🎯 Intent Detection
    ↓
┌─────────────┬─────────────┬─────────────┐
│ 👤 Lead     │ 📅 Booking  │ 🍽️ Menu     │
│ Agent       │ Agent       │ Agent       │
└─────────────┴─────────────┴─────────────┘
    ↓
🔄 CRM Actions (HubSpot/Airtable)
    ↓
📊 Session Analytics & Reporting
```

### Agent Capabilities

#### 👤 Lead Agent
- Collects name and email
- Understands use cases
- Creates HubSpot contacts
- Handles follow-up scheduling

#### 📅 Booking Agent  
- Manages table reservations
- Checks real-time availability
- Handles party size and timing
- Creates Airtable reservations
- Manages special requests

#### 🍽️ Menu Agent
- Shares daily specials
- Handles dietary restrictions
- Provides pricing information
- Supports repeat requests

### Data Flow

```
🎤 Audio Input → STT → Intent Detection → Agent Processing → TTS → 🔊 Audio Output
                                    ↓
                              CRM Integration
                                    ↓
                            📊 Analytics & Logging
```

## 🔧 API Reference

### **Core Endpoints**
- `GET /health` - Basic health check
- `GET /health/detailed` - Comprehensive service status
- `GET /` - Server information and available endpoints

### **Vapi Integration**
- `POST /vapi/events` - Main webhook endpoint for all Vapi events
- `POST /vapi/test` - Test webhook connectivity

### **Admin Dashboard**
- `GET /admin/admin.html` - Web-based admin interface
- `GET /admin/dashboard` - Real-time dashboard data (JSON)
- `GET /admin/calls/:callId` - Detailed call information
- `POST /admin/calls/initiate` - Initiate outbound call
- `GET /admin/logs` - Call history with pagination
- `GET /admin/analytics` - Performance analytics

### **Business Management (SaaS Platform)**
- `POST /api/businesses` - Create new business client
- `GET /api/businesses` - List all businesses
- `GET /api/businesses/:businessId` - Get business details and stats
- `POST /api/businesses/:businessId/phone-numbers` - Assign phone number
- `POST /api/businesses/:businessId/calls` - Initiate call for business
- `GET /api/platform/stats` - Platform-wide statistics
- `POST /api/quick-setup` - Quick business setup for testing

### **Webhook Events Supported**
- `call.started` - Initialize conversation with business routing
- `asr.partial` - Interim speech recognition (logged)
- `asr.final` - Complete speech recognition + AI response generation
- `call.ended` - Cleanup, analytics, and business usage tracking
- `function.call` - Custom function handling (transfer, end call, etc.)

### **Business Configuration Schema**
```json
{
  "name": "Business Name",
  "industry": "restaurant|healthcare|retail|real_estate|automotive|other",
  "plan": "starter|professional|enterprise",
  "contact": {
    "email": "contact@business.com",
    "phone": "+1234567890",
    "name": "Contact Name",
    "company": "Company Name"
  },
  "voiceConfig": {
    "primaryIntent": "lead_capture|booking|support|sales",
    "customPrompts": {
      "greeting": "Custom greeting message",
      "businessInfo": "Business description",
      "specialInstructions": "Special handling instructions"
    },
    "voice": {
      "provider": "elevenlabs",
      "speed": 1.0,
      "tone": "professional|friendly|energetic|calm"
    }
  }
}
```

## 📊 Monitoring & Analytics

### Session Tracking
- Real-time conversation state
- Intent progression analysis
- Data collection completeness
- CRM action success rates

### Performance Metrics
- Response generation time
- STT/TTS processing duration
- CRM API response times
- Error rates and types

### Logging
- Structured JSON logs with Pino
- PII redaction for compliance
- Request/response tracing
- Error context preservation

## 🏢 Voice AI Company Deployment

### **SaaS Platform Architecture**

```
🌐 Internet
    ↓
🔄 Load Balancer (Multiple Regions)
    ↓
📞 Voice AI Platform Instances
    ↓
┌─────────────┬─────────────┬─────────────┐
│ 🏢 Client A │ 🏢 Client B │ 🏢 Client C │
│ Restaurant  │ Healthcare  │ Real Estate │
│ +1234567890 │ +1987654321 │ +1555666777 │
└─────────────┴─────────────┴─────────────┘
    ↓
💾 Multi-Tenant Database + 📊 Analytics
```

### **Docker Deployment**

```bash
# Development
docker-compose up --build

# Production with multiple replicas
docker-compose -f docker-compose.prod.yml up -d --scale voice-agent=3
```

### **Environment Configuration**

```bash
# Production environment
NODE_ENV=production
LOG_LEVEL=info
BASE_URL=https://voice-ai.yourcompany.com

# Multi-tenant security
VAPI_WEBHOOK_SECRET=your_secure_secret
ADMIN_API_KEY=your_admin_secret

# Database (for production scaling)
DATABASE_URL=postgresql://user:pass@host:5432/voiceai
REDIS_URL=redis://host:6379

# Monitoring
SENTRY_DSN=your_sentry_dsn
DATADOG_API_KEY=your_datadog_key
```

### **Scaling for Voice AI Company**

#### **Current Capabilities (Ready Now)**
- ✅ **Multi-tenant architecture** - Serve multiple businesses
- ✅ **Concurrent call handling** - Unlimited simultaneous calls
- ✅ **Business-specific routing** - Phone number → business mapping
- ✅ **Real-time monitoring** - Live dashboard for all calls
- ✅ **Usage tracking** - Billing data per business
- ✅ **API-driven** - Fully programmable platform

#### **Production Scaling (Next Steps)**
- 🔄 **PostgreSQL** - Persistent business and call data
- 🔄 **Redis** - Distributed session storage
- 🔄 **Queue System** - Background CRM processing
- 🔄 **Load Balancing** - Multiple server instances
- 🔄 **CDN** - Global voice quality optimization
- 🔄 **Kubernetes** - Auto-scaling based on call volume

### **Business Model Ready Features**

#### **Pricing Tiers**
```javascript
const pricingPlans = {
  starter: {
    maxCalls: 1000,
    maxMinutes: 2000,
    maxPhoneNumbers: 1,
    price: "$99/month"
  },
  professional: {
    maxCalls: 5000,
    maxMinutes: 10000,
    maxPhoneNumbers: 5,
    price: "$299/month"
  },
  enterprise: {
    maxCalls: 50000,
    maxMinutes: 100000,
    maxPhoneNumbers: 25,
    price: "$999/month"
  }
};
```

#### **Usage Tracking**
- **Per-business call counting**
- **Minute usage monitoring**
- **Success rate tracking**
- **CRM integration usage**
- **Overage billing support**

## 🛠️ Development

### Project Structure

```
voice-agent/
├── apps/server/src/
│   ├── agents/          # Intent-specific conversation handlers
│   ├── routes/          # Express route handlers
│   ├── services/        # External API integrations
│   ├── memory/          # Session and state management
│   ├── state/           # Dynamic menu/availability data
│   ├── testkit/         # Local testing and simulation
│   ├── llm/system/      # Conversation prompts and policies
│   ├── types/           # TypeScript definitions
│   └── utils/           # Shared utilities
├── test/                # Test suites
└── .sim-out/           # Simulator output directory
```

### Code Quality

```bash
# Type checking
pnpm build

# Linting
pnpm lint

# Testing
pnpm test

# Coverage
pnpm test --coverage
```

### Adding New Intents

1. **Create Agent**: Implement new agent in `agents/`
2. **Add Prompts**: Create system prompts in `llm/system/`
3. **Update Router**: Register agent in `agents/index.ts`
4. **Add Tests**: Create test scenarios
5. **Update Simulator**: Add simulation scenarios

## 🔍 Troubleshooting

### Common Issues

#### STT Not Working
```bash
# Check configuration
curl http://localhost:3000/health

# Test specific provider
STT_PROVIDER=whisper pnpm dev
```

#### TTS Failures
```bash
# Verify ElevenLabs key
curl -H "xi-api-key: YOUR_KEY" https://api.elevenlabs.io/v1/voices

# Use fallback for testing
TTS_FALLBACK_PROVIDER=mock pnpm dev
```

#### CRM Integration Issues
```bash
# Test HubSpot connection
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.hubapi.com/account-info/v3/details

# Verify Airtable access
curl -H "Authorization: Bearer YOUR_KEY" https://api.airtable.com/v0/YOUR_BASE/YOUR_TABLE?maxRecords=1
```

### **Advanced Troubleshooting**

#### **Multi-Business Call Issues**
```bash
# Check business routing
curl http://localhost:3000/api/businesses

# Verify phone number assignments
curl http://localhost:3000/api/businesses/BUSINESS_ID

# Test specific business webhook
curl -X POST http://localhost:3000/vapi/events \
  -H "Content-Type: application/json" \
  -d '{"type": "call.started", "callId": "test", "call": {"phoneNumber": "+1234567890"}}'
```

#### **Concurrent Call Debugging**
```bash
# Monitor active calls
watch -n 1 'curl -s http://localhost:3000/admin/dashboard | jq .stats.concurrent'

# Check session isolation
curl http://localhost:3000/admin/logs?status=active

# Memory usage monitoring
curl http://localhost:3000/health/detailed | jq .stats.memoryUsage
```

#### **Outbound Calling Issues**
```bash
# Verify outbound configuration
npm run call:outbound -- check

# Test Vapi connectivity
curl -H "Authorization: Bearer $VAPI_API_KEY" https://api.vapi.ai/assistant

# Check business outbound limits
curl http://localhost:3000/api/businesses/BUSINESS_ID | jq .usage.limits
```

### **Performance Optimization**

#### **For High Call Volume**
- **STT Latency**: Use Deepgram streaming for real-time processing
- **TTS Caching**: Cache common responses per business
- **Database**: Move to PostgreSQL for persistent storage
- **Session Storage**: Use Redis cluster for distributed sessions
- **Load Balancing**: Deploy multiple instances behind load balancer

#### **For Voice Quality**
- **ElevenLabs Settings**: Adjust voice speed and tone per business
- **Network Optimization**: Use CDN for audio delivery
- **Regional Deployment**: Deploy closer to customers
- **Fallback Systems**: Multiple TTS providers per region

#### **For Business Scaling**
- **Async CRM Processing**: Queue CRM operations for faster response
- **Webhook Optimization**: Batch process multiple events
- **Caching Strategy**: Cache business configurations
- **Database Indexing**: Optimize queries for business lookup

## 📝 License

MIT License - see LICENSE file for details.

