#!/bin/bash
# 🚀 WA Gateway VPS Optimization Script
# Automatically optimizes based on available resources

set -e

echo "🚀 WA Gateway VPS Optimization Starting..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check system resources
check_resources() {
    print_info "Checking system resources..."
    
    TOTAL_RAM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    AVAILABLE_RAM=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    
    print_info "Total RAM: ${TOTAL_RAM}MB, Available: ${AVAILABLE_RAM}MB"
    
    if [ "$TOTAL_RAM" -lt 1000 ]; then
        print_warning "LOW RAM VPS detected (${TOTAL_RAM}MB)"
        MEMORY_LIMIT="400M"
        CPU_LIMIT="0.8"
        NODE_MEMORY="300"
    elif [ "$TOTAL_RAM" -lt 2000 ]; then
        print_info "MEDIUM RAM VPS detected (${TOTAL_RAM}MB)"
        MEMORY_LIMIT="600M"
        CPU_LIMIT="1.0"
        NODE_MEMORY="450"
    else
        print_success "HIGH RAM VPS detected (${TOTAL_RAM}MB)"
        MEMORY_LIMIT="800M"
        CPU_LIMIT="1.5"
        NODE_MEMORY="600"
    fi
}

# Stop existing containers
stop_existing() {
    print_info "Stopping existing containers..."
    docker-compose down 2>/dev/null || true
    docker system prune -f
    print_success "Cleanup completed"
}

# Deploy optimized version
deploy_optimized() {
    print_info "Deploying with resource limits: ${MEMORY_LIMIT} RAM, ${CPU_LIMIT} CPU"
    
    # Update docker-compose with resource limits
    export MEMORY_LIMIT
    export CPU_LIMIT
    export NODE_MEMORY
    
    # Use optimized docker-compose
    docker-compose -f docker-compose.optimized.yml up -d --build
    
    print_success "Optimized deployment completed!"
}

# Monitor status
monitor_status() {
    print_info "Monitoring deployment status..."
    sleep 30
    
    docker ps --filter "name=wa-gateway"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    
    print_success "Monitoring complete!"
}

# Main execution
check_resources
stop_existing
deploy_optimized
monitor_status

echo
print_success "🎉 VPS Optimization Complete!"
echo "Access URLs:"
echo "  - Dashboard: http://localhost:5000"
echo "  - API: http://localhost:5001"
echo "  - Backend: http://localhost:3001"
echo
echo "Monitor with: docker stats wa-gateway-optimized"