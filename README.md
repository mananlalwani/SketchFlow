# Live Draw Sync 🎨

A modern, real-time collaborative drawing application built with the latest technologies. Draw on one device (iPad) and view live updates on another (PC) with seamless synchronization.

## ✨ Features

- **Real-time Collaboration**: Draw on one device and see updates instantly on all connected devices
- **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- **Touch Optimized**: Perfect for iPad drawing with pressure sensitivity support
- **Advanced Drawing Tools**: Pen, eraser, shapes, text, and color picker
- **Performance Optimized**: Hardware acceleration, efficient rendering, and smooth 60+ FPS
- **Progressive Web App**: Installable on mobile devices with offline capabilities
- **Cross-platform**: Works on iPad, desktop, and mobile browsers

## 🚀 Technologies Used

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for modern styling
- **Radix UI** components for accessibility
- **Zustand** for state management
- **Socket.IO Client** for real-time communication
- **PWA** support with service worker

### Backend
- **Node.js** with TypeScript
- **Express.js** with modern middleware
- **Socket.IO** for WebSocket communication
- **Advanced error handling** and logging
- **Performance monitoring**

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or pnpm

### Quick Start

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd live_test
```

2. **Install dependencies**
```bash
npm install
```

3. **Start development servers**
```bash
npm run dev
```

This will start:
- Frontend dev server on `http://localhost:5173`
- Backend server on `http://localhost:3000`

4. **Open in browser**
- Drawing interface: `http://localhost:5173/draw`
- Viewer interface: `http://localhost:5173/view`

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

## 📱 Usage

### Drawing Interface (`/draw`)
- **iPad/Touch Optimized**: Perfect for drawing with touch devices
- **Tool Selection**: Pen, eraser, line, rectangle, ellipse, text
- **Brush Settings**: Adjustable size and opacity
- **Color Picker**: Custom colors with easy selection
- **Undo/Redo**: Full history support
- **Export**: Save your drawings
- **Real-time Sync**: All strokes are broadcast live

### Viewer Interface (`/view`)
- **Live Updates**: See drawings appear in real-time
- **Pan & Zoom**: Navigate large canvases smoothly
- **Go to Content**: Auto-center on drawing content
- **Performance Stats**: Monitor FPS and connection status

## 🎨 Key Improvements from Original

### Architecture
- ✅ **TypeScript** throughout for type safety
- ✅ **Modern React** with hooks and functional components  
- ✅ **Component-based** modular architecture
- ✅ **State management** with Zustand
- ✅ **Build tools** with Vite for fast development

### Performance
- ✅ **Hardware acceleration** for smooth rendering
- ✅ **Optimized canvas operations** with efficient drawing
- ✅ **Frame rate monitoring** and adaptive performance
- ✅ **Memory management** with object pooling
- ✅ **Throttled network updates** to prevent spam

### User Experience
- ✅ **Modern UI/UX** with glass morphism design
- ✅ **Mobile responsive** toolbar and controls
- ✅ **Touch optimized** for iPad drawing
- ✅ **Real-time feedback** with immediate visual updates
- ✅ **PWA support** for app-like experience

### Developer Experience
- ✅ **Hot reload** development with Vite
- ✅ **TypeScript** for better code quality
- ✅ **ESLint** configuration for consistent code
- ✅ **Modular structure** for maintainability
- ✅ **Error handling** and logging throughout

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Database (PostgreSQL)
# Example for local PostgreSQL:
# DATABASE_URL="postgresql://user:password@localhost:5432/live_draw?schema=public"
# Example for Neon (serverless PostgreSQL):
# DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/live_draw?sslmode=require"
# Example for Supabase:
# DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
DATABASE_URL="postgresql://user:password@localhost:5432/live_draw?schema=public"

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
```

### Database Setup

1. **Set up PostgreSQL database**:
   - Local: Install PostgreSQL and create a database
   - Cloud: Use [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app)

2. **Run Prisma migrations**:
```bash
pnpm prisma migrate dev --name init
```

3. **Generate Prisma Client** (if needed):
```bash
pnpm prisma generate
```

### Customization
- **Canvas Size**: Modify `WORLD_WIDTH` and `WORLD_HEIGHT` in canvas components
- **Performance**: Adjust frame rate limits and batch sizes
- **UI Theme**: Customize colors in `tailwind.config.js`
- **Tools**: Add new drawing tools in the toolbar component

## 📊 Performance Features

- **60+ FPS** smooth rendering with hardware acceleration
- **Efficient WebSocket** communication with batching
- **Memory optimization** with object pooling
- **Browser-specific optimizations** for Chrome, Safari, Firefox
- **Adaptive throttling** based on device performance

## 🌐 PWA Features

- **Offline capable** with service worker caching
- **Installable** on mobile devices and desktop
- **App-like experience** with standalone display
- **Background sync** for offline drawing (coming soon)

## 🚀 Deployment

### Docker (Recommended)
```bash
# Build and run with Docker
docker build -t live-draw-sync .
docker run -p 3000:3000 live-draw-sync
```

### Manual Deployment
```bash
# Build for production
npm run build

# Start server
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Original drawing application architecture
- React and TypeScript communities
- Radix UI for accessible components
- Tailwind CSS for utility-first styling







