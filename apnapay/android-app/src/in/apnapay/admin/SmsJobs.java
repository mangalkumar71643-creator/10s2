package in.apnapay.admin;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Background work: RETRY sends saved SMS as soon as internet is back; HEARTBEAT pings the server
 * every 15 minutes so the admin panel shows the phone as online. Both survive a phone restart.
 */
public class SmsJobs extends JobService {
    static final int RETRY = 1001;
    static final int HEARTBEAT = 1002;

    static void scheduleRetry(Context c) {
        JobInfo job = new JobInfo.Builder(RETRY, new ComponentName(c, SmsJobs.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .setPersisted(true)
            .build();
        scheduler(c).schedule(job);
    }

    static void setHeartbeat(Context c, boolean on) {
        if (!on) {
            scheduler(c).cancel(HEARTBEAT);
            return;
        }
        JobInfo job = new JobInfo.Builder(HEARTBEAT, new ComponentName(c, SmsJobs.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000L)
            .setPersisted(true)
            .build();
        scheduler(c).schedule(job);
    }

    private static JobScheduler scheduler(Context c) {
        return (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context c = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean sent = SmsSender.flush(c);
                if (params.getJobId() == HEARTBEAT) SmsSender.ping(c);
                jobFinished(params, params.getJobId() == RETRY && !sent);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // try again later
    }
}
