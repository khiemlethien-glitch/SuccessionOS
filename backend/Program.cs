using Microsoft.EntityFrameworkCore;
using SuccessionOS.Application.Services;
using SuccessionOS.Infrastructure.Data;
using SuccessionOS.Infrastructure.VnrHre;

var builder = WebApplication.CreateBuilder(args);

// ─── CORS ─────────────────────────────────────────────────────────────────────
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:4200", "https://succession-os-y6mt.vercel.app")
     .AllowAnyHeader()
     .AllowAnyMethod()));

// ─── DB (SQLite) ──────────────────────────────────────────────────────────────
var dbPath = Path.Combine(builder.Environment.ContentRootPath, "succession.db");
builder.Services.AddDbContext<SuccessionDbContext>(o =>
    o.UseSqlite($"Data Source={dbPath}"));

// ─── Memory Cache ─────────────────────────────────────────────────────────────
builder.Services.AddMemoryCache();

// ─── IHttpContextAccessor — dùng bởi VnrAuthHandler để lấy JWT token ─────────
builder.Services.AddHttpContextAccessor();

// ─── VnrAuthHandler — forward user OIDC JWT → VnR API ────────────────────────
builder.Services.AddTransient<VnrAuthHandler>();

// ─── VnR HRE HttpClient (port 7067) ──────────────────────────────────────────
// SSL bypass (self-signed cert) + VnrAuthHandler forward JWT
var vnrBase = builder.Configuration["VnrHre:BaseUrl"] ?? "https://172.21.30.87:7067";

builder.Services.AddHttpClient<VnrHreClient>(c =>
{
    c.BaseAddress = new Uri(vnrBase);
    c.Timeout     = TimeSpan.FromSeconds(30);
})
.ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    ServerCertificateCustomValidationCallback =
        HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
})
.AddHttpMessageHandler<VnrAuthHandler>();

// ─── VnR SCC HttpClient (port 7063) ──────────────────────────────────────────
// Same SSL bypass + JWT forwarding, different base URL
var sccBase = builder.Configuration["VnrScc:BaseUrl"] ?? "https://172.21.30.87:7063";

builder.Services.AddHttpClient<VnrSccClient>(c =>
{
    c.BaseAddress = new Uri(sccBase);
    c.Timeout     = TimeSpan.FromSeconds(30);
})
.ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    ServerCertificateCustomValidationCallback =
        HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
})
.AddHttpMessageHandler<VnrAuthHandler>();

// ─── OpenAI HttpClient ────────────────────────────────────────────────────────
builder.Services.AddHttpClient("openai", c =>
{
    c.BaseAddress = new Uri("https://api.openai.com");
    c.Timeout     = TimeSpan.FromSeconds(30);
});

// ─── Application Services ─────────────────────────────────────────────────────
builder.Services.AddScoped<EmployeeSyncService>();
builder.Services.AddScoped<AiInsightService>();

// ─── Controllers + Swagger ────────────────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy =
            System.Text.Json.JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.DefaultIgnoreCondition =
            System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ─── Auto-migrate on startup ──────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<SuccessionDbContext>();
    ctx.Database.EnsureCreated();

    // ── Ensure new profile-snapshot columns exist (idempotent) ───────
    var conn = ctx.Database.GetDbConnection();
    if (conn.State != System.Data.ConnectionState.Open) conn.Open();
    var cmd = conn.CreateCommand();
    // Run each separately, ignore errors (column already exists)
    foreach (var colDef in new[]
    {
        "ALTER TABLE EmployeeExtensions ADD COLUMN FullName TEXT",
        "ALTER TABLE EmployeeExtensions ADD COLUMN Email TEXT",
        "ALTER TABLE EmployeeExtensions ADD COLUMN OrgStructureId TEXT",
        "ALTER TABLE EmployeeExtensions ADD COLUMN JobTitleId TEXT",
        "ALTER TABLE EmployeeExtensions ADD COLUMN HireDate TEXT",
    })
    {
        try { cmd.CommandText = colDef; cmd.ExecuteNonQuery(); }
        catch { /* column already exists */ }
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthorization();
app.MapControllers();

app.Run();
