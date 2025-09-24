pipeline {
  agent any
  options { timestamps(); disableConcurrentBuilds() }

  environment {
    IMAGE          = "simple-pet-adopt"
    TAG            = "${env.BUILD_NUMBER}"

    SONAR_HOST_URL = "http://host.docker.internal:9000"
    SONAR_LOGIN    = credentials('sonar-token')

    APP_USER       = "admin"
    APP_PASS       = "admin123"
    SESSION_SECRET = "change_me_in_jenkins"
  }

  stages {

    stage('Build') {
      steps {
        echo "Building Docker image ${IMAGE}:${TAG}"
        sh '''
          docker build -t $IMAGE:$TAG .
          docker tag $IMAGE:$TAG $IMAGE:latest
        '''
      }
    }

    stage('Test') {
  steps {
    echo "Run unit tests in the built image and extract coverage"
    sh """
      set -eux

      # 1) Create a throwaway container from the just-built image that runs the tests
      CID=\$(docker create simple-pet-adopt:${TAG} /bin/sh -lc '
        set -eux
        node -v
        npm -v
        npm test -- --coverage
      ')

      # 2) Start it and stream logs (if tests fail, we still want to copy coverage below)
      docker start -a "\$CID" || true

      # 3) Copy coverage folder from the container to Jenkins workspace
      rm -rf "${WORKSPACE}/coverage" || true
      docker cp "\$CID:/app/coverage" "${WORKSPACE}/coverage" || true

      # 4) Clean up the container
      docker rm "\$CID" || true
      # Make artifacts world-readable for Jenkins
      chmod -R a+rX "${WORKSPACE}/coverage" || true
    """
  }
  post {
    always {
      script {
        if (fileExists('coverage')) {
          archiveArtifacts artifacts: 'coverage/**', fingerprint: true
        } else {
          echo 'No coverage directory found to archive'
        }
      }
    }
  }
}



    stage('Code Quality') {
  steps {
    echo "SonarQube scan using official scanner image"
    sh """
      docker run --rm \
        -e SONAR_HOST_URL=$SONAR_HOST_URL \
        -e SONAR_LOGIN=$SONAR_LOGIN \
        -v ${WORKSPACE}:/usr/src \
        sonarsource/sonar-scanner-cli \
        sonar-scanner \
          -Dsonar.projectBaseDir=/usr/src
    """
  }
}


    stage('Security') {
      steps {
        echo "npm audit and Trivy scan"
        sh """
          docker run --rm -v "${WORKSPACE}:/app" -w /app node:20 \
            bash -lc 'npm ci && npm audit --json || true'

          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:0.54.1 image --format table $IMAGE:$TAG || true
        """
      }
    }

    stage('Deploy (Staging)') {
      steps {
        echo "docker-compose up web-staging (3001)"
        sh '''
          docker-compose -f docker-compose.yml up -d --build web-staging
          curl -fsS http://host.docker.internal:3001/health
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        echo "docker-compose up web-prod (3000)"
        sh '''
          docker tag $IMAGE:$TAG $IMAGE:prod
          docker-compose -f docker-compose.yml up -d web-prod
          curl -fsS http://host.docker.internal:3000/health
          git tag -a "v1.${BUILD_NUMBER}" -m "release v1.${BUILD_NUMBER}" || true
        '''
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        echo "Start Uptime Kuma and verify endpoints"
        sh '''
          docker-compose -f docker-compose.yml up -d uptime-kuma || true
          curl -fsS http://host.docker.internal:3000/health
          curl -fsS http://host.docker.internal:3001/health
        '''
      }
    }
  }

  post {
    success { echo "All good. Staging :3001, Prod :3000, Sonar :9000, Kuma :3002" }
    failure { echo "Something faceplanted. Check the first red line in Console Output." }
  }
}
