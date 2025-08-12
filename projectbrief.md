# Project Brief: Ramana Maharshi Talks

## Project Overview
A spiritual conversation application that provides authentic, AI-powered interactions based on the teachings of Sri Ramana Maharshi, a renowned spiritual teacher known for his teachings on self-inquiry and self-realization.

## Core Mission
To create a digital platform that allows users to engage in meaningful spiritual conversations with an AI that embodies the authentic voice and wisdom of Sri Ramana Maharshi, making his profound teachings accessible to seekers worldwide.

## Primary Goals
1. **Authentic Spiritual Guidance**: Provide responses that maintain the authentic voice and teaching style of Ramana Maharshi
2. **Knowledge-Based Interactions**: Use a comprehensive knowledge base of Ramana's teachings for accurate responses
3. **Accessible Spiritual Practice**: Make self-inquiry and spiritual wisdom available 24/7 through technology
4. **Personalized Experience**: Offer contextually relevant responses and follow-up questions
5. **Multilingual Support**: Support multiple languages for global accessibility

## Key Requirements

### Functional Requirements
- Interactive chat interface with realistic typing effects
- Vector-based semantic search through knowledge base
- Web search fallback for comprehensive responses
- User authentication and conversation history
- Text-to-speech functionality with elderly voice
- Mobile-responsive design
- Dark mode support
- Conversation memory (until refreshed)
- Response feedback system
- Suggested questions and follow-up bubbles

### Technical Requirements
- React with TypeScript frontend
- Supabase backend (authentication, database with pgvector already has loaded)
- gemini ai api for embeddings and response generation
- gemini ai api for chat completions
- Netlify deployment with serverless functions
- Vector similarity search using pgvector extension or any advance method
- Real-time conversation management
- Error handling with graceful fallbacks

### User Experience Requirements
- Welcoming interface with spiritual greeting ("OM NAMO BHAGAVATHE RAMANAYA")
- Intuitive navigation between chat and satsang modes
- Seamless authentication flow
- Responsive design for all device types
- Accessible design with proper contrast and navigation
- Fast loading times and smooth animations

## Success Criteria
1. **Accuracy**: Responses accurately reflect Ramana Maharshi's teachings
2. **Authenticity**: AI maintains the authentic voice and style of Ramana
3. **Relevance**: Responses are contextually relevant to user questions
4. **Accessibility**: Platform is accessible to users worldwide
5. **Performance**: Fast response times and reliable service
6. **User Engagement**: Users return for continued spiritual guidance

## Target Audience
- Spiritual seekers interested in self-inquiry
- Students of Advaita Vedanta
- Followers of Sri Ramana Maharshi's teachings
- Anyone seeking spiritual wisdom and guidance
- Users looking for authentic spiritual conversations

## Project Scope
- Core chat functionality with knowledge-based responses
- User authentication and conversation management
- Satsang mode for group spiritual discussions
- Mobile and desktop optimization
- Multi-language support
- Deployment and hosting infrastructure

## Out of Scope
- Real-time video/audio communication (beyond text-to-speech)
- E-commerce or payment processing
- Social media integration
- Advanced analytics beyond basic usage metrics
- Integration with other spiritual platforms 
