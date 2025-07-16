# Hyperliquid Position Tracker - Enhanced

A comprehensive web application for monitoring multiple Hyperliquid wallet addresses and their trading positions with advanced tracking, analytics, and notification capabilities.

## 🚀 Core Features

### Position Management
- **Multi-Address Tracking**: Monitor multiple Hyperliquid wallet addresses simultaneously
- **Real-time Position Data**: Live updates of position metrics including size, P&L, leverage, and liquidation prices
- **Position Status Tracking**: Comprehensive tracking of active, new, closed, and hidden positions
- **Position History**: Complete historical record of all trading positions with analytics

### Advanced UI & Navigation
- **Tabbed Interface**: Separate views for:
  - **Active Positions**: Currently open positions
  - **New Positions**: Positions opened in the last 24 hours
  - **Closed Positions**: Historical closed positions with final P&L
  - **Hidden Positions**: User-hidden positions with toggle visibility
  - **All Positions**: Complete position history and current positions
- **Smart Filtering**: Filter by cryptocurrency, trader, and custom search terms
- **Responsive Design**: Mobile-first approach with adaptive layouts
- **Pagination**: Efficient handling of large position datasets

### Analytics & Insights
- **Performance Metrics**: Total P&L, win rate, average holding time
- **Position Analytics**: Duration tracking, holding period analysis
- **Win/Loss Ratios**: Comprehensive trading performance statistics
- **Real-time Calculations**: Live P&L and percentage calculations

### Notification System
- **Smart Alerts**: Configurable email notifications for:
  - New position detection
  - Position closures
  - Significant P&L changes
- **Per-Address Controls**: Enable/disable notifications for individual wallets
- **Email Management**: Bulk email configuration with test functionality
- **Rich Notifications**: HTML and text email templates with position details

### Data Management
- **Persistent Storage**: Full Supabase integration with PostgreSQL backend
- **Real-time Sync**: Live data updates with Supabase real-time subscriptions
- **Position History**: Comprehensive tracking in `position_history` table
- **Status Management**: Enhanced `tracked_positions` with status, duration, and P&L tracking

## 🏗️ Technical Architecture

### Frontend Stack
- **React 18** with TypeScript for type safety
- **Vite** build system for fast development
- **Tailwind CSS** for responsive styling
- **Radix UI** components for accessibility
- **Lucide React** icons for consistent UI

### Backend & Database
- **Supabase** PostgreSQL database with real-time capabilities
- **Edge Functions** for email notifications via Resend API
- **Row Level Security** for data protection
- **Real-time subscriptions** for live updates

### API Integration
- **Hyperliquid API** for position data and market prices
- **Efficient batching** to respect API rate limits
- **Price caching** to optimize performance
- **Error handling** with graceful fallbacks

## 📊 Database Schema

### Enhanced Tables

#### `wallet_addresses`
- Stores wallet addresses with aliases, colors, and notification preferences
- `notifications_enabled` column for per-address notification control

#### `tracked_positions` (Enhanced)
- **New columns added**:
  - `status`: 'active', 'new', 'closed'
  - `closed_at`: Timestamp when position was closed
  - `final_pnl`: Final profit/loss when closed
  - `holding_duration_minutes`: Duration position was held
  - `last_updated`: Last update timestamp
  - `position_key`: Unique identifier for position tracking

#### `position_history` (New)
- Complete historical record of all positions
- Tracks entry/exit prices, P&L, holding duration
- Enables comprehensive analytics and reporting

#### `notification_emails`
- Manages email addresses for alert delivery
- Active/inactive status for email management

#### `notification_logs`
- Audit trail of sent notifications
- Success/failure tracking for reliability

#### `hidden_positions`
- User-controlled position visibility
- Persistent hide/show state

## 🔧 Key Features Implemented

### Position Detection Logic
- **New Position Detection**: Automatically identifies newly opened positions
- **Position Closure Detection**: Tracks when positions are closed
- **Status Management**: Maintains position lifecycle (new → active → closed)
- **Duration Tracking**: Calculates holding periods for analytics

### Performance Optimizations
- **Batched API Calls**: Efficient data fetching with rate limit respect
- **Price Caching**: 30-second cache for market price data
- **Pagination**: Handles large datasets efficiently
- **Background Processing**: Non-blocking notifications and updates

### User Experience
- **Loading States**: Skeleton loaders and progress indicators
- **Error Handling**: User-friendly error messages
- **Theme Support**: Light/dark mode with system preference detection
- **Auto-refresh**: Configurable intervals (30s, 1m, 5m)

### Analytics Features
- **Position Metrics**: Total positions, active/closed counts
- **P&L Analysis**: Total profit/loss, win/loss ratios
- **Time Analysis**: Average holding periods, position duration
- **Performance Tracking**: Win rate calculations and trends

## 🚨 Notification Capabilities

### Email Alerts
- **New Position Alerts**: Immediate notification when positions are opened
- **Closure Notifications**: Alerts when positions are closed with final P&L
- **Test Functionality**: Verify email delivery with test notifications
- **Rich Formatting**: HTML emails with position details and styling

### Smart Controls
- **Per-Address Toggle**: Enable/disable notifications for specific wallets
- **Bulk Email Management**: Add/remove multiple notification emails
- **Notification History**: Track sent notifications for audit purposes

## 🎯 Recent Enhancements

### Database Improvements
- Enhanced `tracked_positions` table with status tracking
- New `position_history` table for comprehensive analytics
- Improved indexing for better query performance
- Real-time subscriptions for live data updates

### UI/UX Enhancements
- Five-tab interface for comprehensive position management
- Analytics dashboard with key performance metrics
- Enhanced filtering and search capabilities
- Improved mobile responsiveness

### Backend Optimizations
- Smarter position detection and status management
- Background processing for notifications
- Enhanced error handling and recovery
- Performance optimizations for large datasets

## 🔮 Future Roadmap

### Advanced Analytics
- Portfolio performance tracking
- Risk analysis and position sizing insights
- Trading pattern analysis
- Custom dashboard creation

### Enhanced Notifications
- Webhook support for external integrations
- Custom notification rules and triggers
- Mobile push notifications
- Slack/Discord integration

### Trading Tools
- Position size calculator
- Risk management tools
- Automated position alerts
- Integration with trading bots

---

**Built with modern web technologies for reliable, real-time position tracking and comprehensive trading analytics.**
