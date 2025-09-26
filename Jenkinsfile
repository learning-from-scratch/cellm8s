pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    // App + image
    IMAGE                = 'simple-pet-adopt'
    TAG                  = "${env.BUILD_NUMBER}"
    COMPOSE_PROJECT_NAME = 'cellm8s'

    // Workspace volume mapping used inside helper containers
    VOLUME_NAME = 'jenkins_home'
    PROJECT_DIR = '/var/jenkins_home/workspace/cellm8s'

    // Sonar
    SONAR_HOST_URL = 'http://host.docker.internal:9000'
    SONAR_TOKEN    = credentials('sonar-token')   // normalized

    // App secrets (replace in Jenkins, not here)
    APP_USER       = 'admin'
    APP_PASS       = 'admin123'
    SESSION_SECRET = 'change_me_in_jenkins'

    // Notifications
    RECIPIENTS = 'brennanterreoz@gmail.com'

    // Security thresholds
    // NONE|HIGH|CRITICAL
    FAIL_ON_TRIVY = 'CRITICAL'
    FAIL_ON_NPM   = 'CRITICAL'
  }

  stages {

    stage('Build') {
      steps {
        echo "Building Docker image ${IMAGE}:${TAG}"
        sh """
          set -Eeuo pipefail
          docker build -t "${IMAGE}:${TAG}" .
          docker tag "${IMAGE}:${TAG}" "${IMAGE}:latest"
        """
      }
    }

    stage('Test') {
      steps {
        echo 'Run unit tests in the built image and extract coverage + JUnit'
        sh """
          set -Eeuo pipefail
          CID=\$(docker create "${IMAGE}:${TAG}" /bin/sh -lc '
            set -Eeuo pipefail
            npm ci
            npm test -- --ci --coverage
          ')
          docker start -a "\$CID" || true

          rm -rf   "${WORKSPACE}/coverage" || true
          rm -f    "${WORKSPACE}/junit.xml" || true

          docker cp "\$CID:/app/coverage"  "${WORKSPACE}/coverage"  || true
          docker cp "\$CID:/app/junit.xml" "${WORKSPACE}/junit.xml" || true

          docker rm "\$CID" || true
          chmod -R a+rX "${WORKSPACE}/coverage" || true
        """
      }
      post {
        always {
          script {
            if (fileExists('coverage'))  archiveArtifacts artifacts: 'coverage/**', fingerprint: true
            if (fileExists('junit.xml')) junit 'junit.xml'
          }
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
        sh """
          set -Eeuo pipefail
          docker run --rm \\
            -e SONAR_HOST_URL="${SONAR_HOST_URL}" \\
            -e SONAR_TOKEN="${SONAR_TOKEN}" \\
            -v "${VOLUME_NAME}:/var/jenkins_home" \\
            sonarsource/sonar-scanner-cli \\
              sonar-scanner \\
                -Dsonar.projectBaseDir="${PROJECT_DIR}" \\
                -Dsonar.login="${SONAR_TOKEN}"
        """
      }
    }

    stage('Security') {
      steps {
        sh """
          set -Eeuo pipefail

          # npm audit in a clean Node container
          docker run --rm \\
            -v "${VOLUME_NAME}:/var/jenkins_home" \\
            -w "${PROJECT_DIR}" \\
            node:20 bash -lc 'set -Eeuo pipefail; npm ci; npm audit --json || true' \\
          | tee npm-audit.json >/dev/null

          # Trivy scan; do not fail here, we decide in Groovy
          docker run --rm \\
            -v /var/run/docker.sock:/var/run/docker.sock \\
            aquasec/trivy:0.54.1 image "${IMAGE}:${BUILD_NUMBER}" \\
              --severity HIGH,CRITICAL \\
              --format json -o trivy-report.json || true
        """
      }
      post {
        always {
          archiveArtifacts artifacts: 'npm-audit.json,trivy-report.json', fingerprint: true, allowEmptyArchive: true
          script {
            def npmTxt   = fileExists('npm-audit.json')    ? readFile('npm-audit.json').toLowerCase()    : ''
            def trivyTxt = fileExists('trivy-report.json') ? readFile('trivy-report.json').toLowerCase() : ''

            def npmHigh  = npmTxt.contains('"severity":"high"')
            def npmCrit  = npmTxt.contains('"severity":"critical"')
            def triHigh  = trivyTxt.contains('"severity":"high"')
            def triCrit  = trivyTxt.contains('"severity":"critical"')

            def failOnNpm   = env.FAIL_ON_NPM
            def failOnTrivy = env.FAIL_ON_TRIVY

            def badNpm   = (failOnNpm   == 'HIGH'     && (npmHigh || npmCrit)) || (failOnNpm   == 'CRITICAL' && npmCrit)
            def badTrivy = (failOnTrivy == 'HIGH'     && (triHigh || triCrit)) || (failOnTrivy == 'CRITICAL' && triCrit)

            if (badNpm || badTrivy) {
              currentBuild.result = 'UNSTABLE'
              echo "Security threshold hit. npm(${failOnNpm})=${badNpm}, trivy(${failOnTrivy})=${badTrivy}"
            } else {
              echo 'Security below thresholds. Marking SUCCESS.'
            }
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      steps {
        echo 'docker-compose up web-staging (3001)'
        sh """
          set -Eeuo pipefail
          docker-compose -f docker-compose.yml up -d web-staging || true

          for i in \$(seq 1 30); do
            code=\$(curl -s -o /dev/null -w "%{http_code}" http://host.docker.internal:3001/health || true)
            [ "\$code" = "200" ] && { echo "Healthcheck passed"; break; }
            echo "Waiting for app... (got HTTP \$code)"; sleep 2
          done

          docker-compose -f docker-compose.yml logs web-staging > staging.log 2>&1 || true
        """
        archiveArtifacts artifacts: 'staging.log', fingerprint: true, allowEmptyArchive: true
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        echo 'docker-compose up web-prod (3000)'
        sh """
          set -Eeuo pipefail
          : "\${IMAGE:=simple-pet-adopt}"
          : "\${TAG:=latest}"
          export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}"

          docker tag "\${IMAGE}:\${TAG}" "\${IMAGE}:prod" || true

          CID=\$(docker ps -q --filter "publish=3000" || true)
          [ -n "\$CID" ] && docker rm -f \$CID || true

          docker-compose -f docker-compose.yml -p "\${COMPOSE_PROJECT_NAME}" rm -fs web-prod || true
          docker-compose -f docker-compose.yml -p "\${COMPOSE_PROJECT_NAME}" up -d --force-recreate web-prod

          for i in \$(seq 1 30); do
            code=\$(curl -s -o /dev/null -w "%{http_code}" http://host.docker.internal:3000/health || true)
            [ "\$code" = "200" ] && { echo "Prod healthy"; break; }
            echo "Waiting for prod... (HTTP \${code:-none})"; sleep 2
          done

          docker logs "\${COMPOSE_PROJECT_NAME}-web-prod-1" > prod.log 2>&1 || true

          git tag -a "v1.${BUILD_NUMBER}" -m "release v1.${BUILD_NUMBER}" || true
        """
        archiveArtifacts artifacts: 'prod.log', fingerprint: true, allowEmptyArchive: true
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        sh """
          set -Eeuo pipefail

          docker-compose -f docker-compose.yml up -d uptime-kuma || true

          for svc in 3000 3001; do
            ok=0
            for i in \$(seq 1 15); do
              code=\$(curl -s -o /dev/null -w "%{http_code}" "http://host.docker.internal:\${svc}/health" || true)
              if [ "\$code" = "200" ]; then
                echo "Service on \${svc} healthy."
                ok=1; break
              fi
              echo "Waiting for \${svc} (got \${code:-none})..."
              sleep 2
            done
            [ \$ok -eq 1 ] || exit 2
          done
        """
      }
      post {
        failure {
          echo 'Monitoring detected a failing health endpoint. See console log.'
        }
      }
    }

  } // stages

  post {
    success {
      emailext(
        to: env.RECIPIENTS,
        subject: "[SUCCESS] ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: """All good

Staging: http://host.docker.internal:3001/health
Prod:    http://host.docker.internal:3000/health

Build: ${env.BUILD_URL}
""",
        attachLog: true,
        compressLog: true,
        attachmentsPattern: 'npm-audit.json,trivy-report.json,staging.log,prod.log'
      )
    }
    failure {
      emailext(
        to: env.RECIPIENTS,
        subject: "[FAILURE] ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: """Build failed

Check console log and attached reports.
Job: ${env.BUILD_URL}
""",
        attachLog: true,
        compressLog: true,
        attachmentsPattern: 'npm-audit.json,trivy-report.json,staging.log,prod.log'
      )
    }
  }
}
