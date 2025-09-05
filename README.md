# 🎙️ Voice AI Agent - Restaurant Lead Conversion System

A production-grade voice AI agent built for restaurant lead conversion, featuring Vapi integration, multi-intent conversation handling, and comprehensive CRM automation.

## ✨ Features

- **🔗 Vapi Integration** - Seamless webhook handling for voice conversations
- **🧠 Intent-Based Agents** - Lead capture, table booking, and menu inquiry specialists
- **🎯 Smart Conversation Flow** - Context-aware responses with policy overrides
- **📊 CRM Automation** - HubSpot contact creation and Airtable reservation management
- **🎵 Multi-STT Support** - OpenAI Whisper and Deepgram integration
- **🗣️ High-Quality TTS** - ElevenLabs with fallback options
- **🧪 Local Testing** - Complete call simulator with no paid services required
- **📈 Real-time Analytics** - Session tracking and conversation insights
- **🔒 Enterprise Ready** - TypeScript, comprehensive error handling, and security

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

## 🧪 Testing Options

### Option A: Local Simulator (Always Available)

Test complete conversation flows without any external services:

```bash
# List available scenarios
pnpm call:simulate list

# Run specific scenarios
pnpm call:simulate run lead-capture
pnpm call:simulate run table-booking
pnpm call:simulate run menu-inquiry
pnpm call:simulate run complex-interaction

# View generated reports
ls .sim-out/
```

The simulator generates:
- 🎵 MP3 audio files for agent responses
- 📊 Detailed JSON reports with conversation analysis
- 📝 Console output with real-time conversation flow
- 🔄 CRM action simulation and validation

### Option B: Live Webhook Testing

For testing with real Vapi integration:

```bash
# Expose local server
ngrok http 3000

# Configure Vapi webhook URL: https://your-ngrok-url.ngrok.io/vapi/events

# Monitor logs
pnpm dev
```

### Option C: Outbound Testing (Optional)

Test outbound calling if configured:

```bash
# Check configuration
pnpm call:outbound check

# Test outbound call
pnpm call:outbound test

# List recent calls
pnpm call:outbound list
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

## 🔧 API Endpoints

### Health & Status
- `GET /health` - Basic health check
- `GET /health/detailed` - Comprehensive service status
- `GET /` - Server information

### Vapi Integration
- `POST /vapi/events` - Webhook endpoint for Vapi events

### Event Types Supported
- `call.started` - Initialize conversation
- `asr.partial` - Interim speech recognition
- `asr.final` - Complete speech recognition + response generation
- `call.ended` - Cleanup and analytics
- `function.call` - Custom function handling

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

## 🚀 Production Deployment

### Docker Deployment

```bash
# Build and run
docker-compose up --build

# Production mode
NODE_ENV=production docker-compose up -d
```

### Environment Setup

```bash
# Production environment variables
NODE_ENV=production
LOG_LEVEL=info

# Security considerations
VAPI_WEBHOOK_SECRET=your_secure_secret

# Monitoring
BASE_URL=https://your-domain.com
```

### Scaling Considerations

#### Current Architecture (Single Instance)
- ✅ In-memory session storage
- ✅ Local file-based state management
- ✅ Direct API integrations

#### Production Scaling (Future)
- 🔄 Redis session storage
- 🔄 Database-backed state management
- 🔄 Queue-based CRM processing
- 🔄 Load balancer configuration

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

### Debug Mode

```bash
# Enable verbose logging
LOG_LEVEL=debug pnpm dev

# Simulator with detailed output
pnpm call:simulate run lead-capture --verbose
```

### Performance Tuning

- **STT Latency**: Switch to Deepgram for streaming
- **TTS Quality**: Adjust ElevenLabs voice settings
- **Response Time**: Optimize LLM prompt length
- **Memory Usage**: Implement Redis for sessions

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📞 Support

- 📧 Email: support@yourcompany.com
- 📚 Documentation: [Link to docs]
- 🐛 Issues: [GitHub Issues]
- 💬 Discord: [Community link]

---

**Built with ❤️ for seamless voice AI experiences**
