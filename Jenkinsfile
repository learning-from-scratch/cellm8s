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

    // ✅ Put real recipients here (comma or space separated)
    RECIPIENTS     = "brennanterreoz@gmail.com"
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
    echo "Run unit tests in the built image and extract coverage + JUnit"
    sh """
      set -eux
      CID=\$(docker create ${IMAGE}:${TAG} /bin/sh -lc '
        set -eux
        npm ci
        npm test -- --ci --coverage
      ')
      docker start -a "\$CID" || true

      # Clean previous artifacts
      rm -rf "${WORKSPACE}/coverage" || true
      rm -f  "${WORKSPACE}/junit.xml" || true

      # Copy test outputs from the container into the workspace
      docker cp "\$CID:/app/coverage"   "${WORKSPACE}/coverage" || true
      docker cp "\$CID:/app/junit.xml"  "${WORKSPACE}/junit.xml" || true

      docker rm "\$CID" || true
      chmod -R a+rX "${WORKSPACE}/coverage" || true
    """
  }
  post {
    always {
      script {
        // Archive raw artifacts for debugging
        if (fileExists('coverage')) {
          archiveArtifacts artifacts: 'coverage/**', fingerprint: true
        }
        if (fileExists('junit.xml')) {
          junit 'junit.xml'   // this feeds Jenkins test trend & pass/fail
        }
      }
      // Publish the HTML coverage site (index.html under lcov-report)
      publishHTML(target: [
        reportDir   : 'coverage/lcov-report',
        reportFiles : 'index.html',
        reportName  : 'Coverage'
      ])
    }
  }
}

    stage('Code Quality') {
      steps {
        withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
          sh '''
            set -eux
            VOLUME_NAME=jenkins_home
            PROJECT_DIR=/var/jenkins_home/workspace/cellm8s
            docker run --rm \
              -e SONAR_HOST_URL=http://host.docker.internal:9000 \
              -e SONAR_TOKEN="${SONAR_TOKEN}" \
              -v ${VOLUME_NAME}:/var/jenkins_home \
              sonarsource/sonar-scanner-cli \
              sonar-scanner \
                -Dsonar.projectBaseDir=${PROJECT_DIR} \
                -Dsonar.login=${SONAR_TOKEN}
          '''
        }
      }
    }

    stage('Security') {
      steps {
        echo 'npm audit and Trivy scan'
        sh '''
          set -eux
          VOLUME_NAME=jenkins_home
          PROJECT_DIR=/var/jenkins_home/workspace/cellm8s

          # Save npm audit to file
          docker run --rm -v ${VOLUME_NAME}:/var/jenkins_home -w ${PROJECT_DIR} \
            node:20 bash -lc 'npm ci && npm audit --json || true' \
            | tee npm-audit.json >/dev/null

          # Trivy image scan -> JSON file
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:0.54.1 image --format json -o trivy-report.json ${IMAGE}:${BUILD_NUMBER} || true
        '''
        archiveArtifacts artifacts: 'npm-audit.json,trivy-report.json', fingerprint: true
      }
    }

    stage('Deploy (Staging)') {
      steps {
        echo "docker-compose up web-staging (3001)"
        sh '''
          set -eux
          for i in $(seq 1 30); do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://host.docker.internal:3001/health || true)
            [ "$code" = "200" ] && { echo "Healthcheck passed"; break; }
            echo "Waiting for app... (got HTTP $code)"; sleep 2
          done
          docker-compose -f docker-compose.yml logs web-staging > staging.log 2>&1 || true
        '''
        archiveArtifacts artifacts: 'staging.log', fingerprint: true, allowEmptyArchive: true
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        echo "docker-compose up web-prod (3000)"
        sh '''
          set -eux
          : "${IMAGE:=simple-pet-adopt}"
          : "${TAG:=latest}"
          export COMPOSE_PROJECT_NAME=cellm8s

          docker tag "$IMAGE:$TAG" "$IMAGE:prod" || true

          CID=$(docker ps -q --filter "publish=3000" || true)
          [ -n "$CID" ] && docker rm -f $CID || true

          docker-compose -f docker-compose.yml -p "$COMPOSE_PROJECT_NAME" rm -fs web-prod || true
          docker-compose -f docker-compose.yml -p "$COMPOSE_PROJECT_NAME" up -d --force-recreate web-prod

          for i in $(seq 1 30); do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://host.docker.internal:3000/health || true)
            [ "$code" = "200" ] && { echo "Prod healthy"; break; }
            echo "Waiting for prod... (HTTP ${code:-none})"; sleep 2
          done

          docker logs ${COMPOSE_PROJECT_NAME}-web-prod-1 > prod.log 2>&1 || true

          git tag -a "v1.${BUILD_NUMBER}" -m "release v1.${BUILD_NUMBER}" || true
        '''
        archiveArtifacts artifacts: 'prod.log', fingerprint: true, allowEmptyArchive: true
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        echo "Start Uptime Kuma and verify endpoints"
        sh '''
          docker-compose -f docker-compose.yml up -d uptime-kuma || true
          curl -fsS http://host.docker.internal:3000/health || true
          curl -fsS http://host.docker.internal:3001/health || true
        '''
      }
    }
  }

  post {
    success {
      emailext(
        to: env.RECIPIENTS,
        subject: "[SUCCESS] ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: """All good ✅

Staging: http://host.docker.internal:3001/health
Prod:    http://host.docker.internal:3000/health

Build: ${env.BUILD_URL}
""",
        attachLog: true,
        compressLog: true,
        // Attach any saved logs/reports
        attachmentsPattern: "npm-audit.json,trivy-report.json,staging.log,prod.log"
      )
    }
    failure {
      emailext(
        to: env.RECIPIENTS,
        subject: "[FAILURE] ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: """Build failed ❌

Check console log and attached reports.
Job: ${env.BUILD_URL}
""",
        attachLog: true,
        compressLog: true,
        attachmentsPattern: "npm-audit.json,trivy-report.json,staging.log,prod.log"
      )
    }
  }
}
